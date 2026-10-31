import { doc, getDocFromServer, onSnapshot, runTransaction, type Transaction, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';
import { GAMES_COLLECTION, INVALID_WRITE_MESSAGE } from './constants';
import { generateId } from './id';
import { parseGameSession, ROLL_LOG_CAP } from './gameParsing';
import { isPlainObject } from './typeGuards';
import { NOTES_CLIENT_ID, NOTES_STALE_MS } from './sharedNotes';
import { applyChanges, composeChanges, EditConflict, readPath, sameValue, type FieldChange } from './syncChanges';
import { changeQueue, emptyQueue, type DraftEdit, type DraftQueue } from './syncStorage';
import type { GameSession } from '@/types';

export const SYNC_PROTOCOL = 2;
type RawGame = Record<string, unknown>;
const SEND_DELAY = 750;

export const gameGeneration = (raw: RawGame): string => isPlainObject(raw.sync) && typeof raw.sync.generation === 'string'
  ? raw.sync.generation : `legacy:${String(raw.createdAt ?? 0)}`;
export const nextSyncMetadata = (raw: RawGame, generation = gameGeneration(raw)) => ({
  protocol: SYNC_PROTOCOL, generation,
  revision: (isPlainObject(raw.sync) && typeof raw.sync.revision === 'number' ? raw.sync.revision : 0) + 1,
  ...(isPlainObject(raw.sync) && typeof raw.sync.lastWrite === 'string' ? { lastWrite: raw.sync.lastWrite } : {}),
});

// A revision rule can reject a racing commit before Firestore reports its
// stale document precondition. The SDK does not retry permission-denied. Only
// retry it after an authorized server read proves that the revision advanced.
const runGameTransaction = async <T>(ref: DocumentReference, apply: (tx: Transaction, observed: (raw: RawGame) => void) => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    let revision: number | undefined;
    try {
      return await runTransaction(db, (tx) => apply(tx, (raw) => { revision = nextSyncMetadata(raw).revision - 1; }));
    } catch (error) {
      if (!isPlainObject(error) || error.code !== 'permission-denied' || revision === undefined) throw error;
      const fresh = await getDocFromServer(ref);
      if (!fresh.exists() || nextSyncMetadata(fresh.data()).revision - 1 <= revision) throw error;
      if (attempt >= 4) throw Object.assign(new Error('Game changed repeatedly. Retry shortly.'), { code: 'aborted' });
    }
  }
};

export interface GameSyncSnapshot {
  raw: RawGame | null;
  game: GameSession | null;
  loading: boolean;
  error: string | null;
  queue: DraftQueue;
  localWrites: number;
  storageError: string | null;
  syncing: boolean;
}

const projectEdit = (raw: RawGame, edit: DraftEdit, check = false): RawGame => {
  if (check && gameGeneration(raw) !== edit.generation) throw new EditConflict('This game was restored. Review your earlier draft.');
  if (edit.restore) {
    if (check && (nextSyncMetadata(raw).revision - 1) !== edit.restoreRevision) throw new EditConflict('The game changed while the restore was being prepared. Review the latest game before restoring again.');
    return { ...edit.restore, notesLocks: {}, sync: nextSyncMetadata(raw, edit.id) };
  }
  let next = applyChanges(raw, edit.changes, check);
  if (edit.deltas) {
    const { characterId, values } = edit.deltas;
    if (!Array.isArray(next.characters) || !next.characters.some((c) => c.id === characterId)) {
      if (check) throw new EditConflict('This character was deleted.');
      return next;
    }
    next = { ...next, characters: next.characters.map((c) => {
      if (c.id !== characterId) return c;
      const data = { ...c.data };
      for (const [field, delta] of Object.entries(values)) data[field] = String((Number(data[field]) || 0) + delta);
      return { ...c, data };
    }) };
  }
  if (edit.order && Array.isArray(next.characters)) {
    const byId = new Map(next.characters.map((c) => [c.id, c]));
    const requested = new Set(edit.order);
    next = { ...next, characters: [
      ...edit.order.flatMap((id) => byId.has(id) ? [byId.get(id)] : []),
      ...next.characters.filter((c) => !requested.has(c.id)),
    ] };
  }
  return next;
};

export class GameSync {
  private remote: RawGame | null = null;
  private remoteFromCache = true;
  private queue: DraftQueue;
  private listeners = new Set<() => void>();
  private unsubscribe?: () => void;
  private channel?: BroadcastChannel;
  private timer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryCount = 0;
  private running = false;
  private sendingPromise?: Promise<void>;
  private hydrated = false;
  private loadedRemote = false;
  private ready: Promise<void> = Promise.resolve();
  private holds = new Map<string, string>();
  private claims = new Map<string, string>();
  private writer = generateId();
  private volatile: DraftEdit[] = [];
  private localChain: Promise<void> = Promise.resolve();
  private state: GameSyncSnapshot;
  private dataState: Pick<GameSyncSnapshot, 'raw' | 'game' | 'loading' | 'error'>;

  constructor(readonly gameId: string) {
    this.queue = emptyQueue(gameId);
    this.state = { raw: null, game: null, loading: true, error: null, queue: this.queue, localWrites: 0, storageError: null, syncing: false };
    this.dataState = this.state;
  }

  getSnapshot = (): GameSyncSnapshot => this.state;
  getDataSnapshot = () => this.dataState;
  getRemote = () => this.confirmedBase();
  getRecovery = () => ({ ...this.queue, unpersisted: this.volatile });

  private confirmedBase = (): RawGame | null => {
    const cached = this.queue.cachedGame;
    // A transaction can commit before the listener's cache reaches disk. Keep
    // the acknowledged baseline with queue cleanup so an offline restart cannot
    // show an older game after removing its acknowledged draft.
    if (this.remoteFromCache && cached && (!this.remote || nextSyncMetadata(cached).revision > nextSyncMetadata(this.remote).revision)) return cached;
    return this.remote;
  };

  private publish = (patch: Partial<GameSyncSnapshot> = {}) => {
    const confirmed = this.confirmedBase();
    let raw = confirmed;
    if (raw) {
      for (const edit of [this.queue.sending, this.queue.conflict, ...this.queue.pending, ...this.volatile]) {
        if (edit && !(isPlainObject(confirmed?.sync) && confirmed.sync.lastWrite === edit.id)) raw = projectEdit(raw, edit);
      }
    }
    let game: GameSession | null = null;
    let error = patch.error === undefined ? this.state.error : patch.error;
    try { if (raw) game = sameValue(raw, this.state.raw) ? this.state.game : parseGameSession(raw, this.gameId); }
    catch { error = "This game's data couldn't be read."; }
    // Status changes preserve data identity, avoiding another game-wide render.
    if (sameValue(raw, this.state.raw)) { raw = this.state.raw; game = this.state.game; }
    this.state = { ...this.state, ...patch, raw, game, error, queue: this.queue };
    if (raw !== this.dataState.raw || error !== this.dataState.error || this.state.loading !== this.dataState.loading) {
      this.dataState = { raw, game, error, loading: this.state.loading };
    }
    this.listeners.forEach((listener) => listener());
  };

  private reload = async () => {
    try {
      this.queue = await changeQueue(this.gameId);
      this.hydrated = true;
      this.publish({ storageError: this.volatile.length ? this.state.storageError : null, loading: !this.loadedRemote });
      this.schedule();
      this.scheduleRetry();
    } catch {
      this.hydrated = true;
      this.publish({ loading: !this.loadedRemote, storageError: 'Could not preserve changes on this device. Keep this page open and retry.' });
    }
  };

  private beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.volatile.length) { event.preventDefault(); event.returnValue = ""; }
  };

  private online = () => { void this.retry(); };
  private flush = () => { this.schedule(0); };
  private storage = (event: StorageEvent) => { if (event.key === 'hearthfire:drafts-changed') void this.reload(); };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (!this.unsubscribe) {
      this.hydrated = false;
      this.loadedRemote = false;
      this.publish({ loading: true });
      this.ready = this.reload();
      this.unsubscribe = onSnapshot(doc(db, GAMES_COLLECTION, this.gameId), (snapshot) => {
        this.loadedRemote = true;
        this.remoteFromCache = snapshot.metadata?.fromCache ?? false;
        this.remote = snapshot.exists() ? snapshot.data() : null;
        const sync = this.remote?.sync;
        const incompatible = isPlainObject(sync) && typeof sync.protocol === 'number' && sync.protocol > SYNC_PROTOCOL;
        this.publish({ loading: !this.hydrated, error: incompatible ? 'A newer Hearthfire version is required. Reload this page.' : null });
        this.schedule();
      }, () => {
        this.loadedRemote = true;
        this.publish({ loading: false, error: 'Could not load game updates. Check your connection and access, then reload.' });
      });
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          this.channel = new BroadcastChannel(`hearthfire-drafts:${this.gameId}`);
          this.channel.onmessage = () => { void this.reload(); };
        } catch { /* Storage events provide the fallback. */ }
      }
      window.addEventListener('beforeunload', this.beforeUnload);
      window.addEventListener('online', this.online);
      window.addEventListener('storage', this.storage);
      window.addEventListener('pagehide', this.flush);
      window.addEventListener('hearthfire:flush', this.flush);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  };

  stop = () => {
    this.unsubscribe?.(); this.unsubscribe = undefined;
    this.channel?.close(); this.channel = undefined;
    clearTimeout(this.timer);
    clearTimeout(this.retryTimer); this.retryTimer = undefined;
    if (!this.volatile.length) window.removeEventListener('beforeunload', this.beforeUnload);
    window.removeEventListener('online', this.online);
    window.removeEventListener('storage', this.storage);
    window.removeEventListener('pagehide', this.flush);
    window.removeEventListener('hearthfire:flush', this.flush);
  };

  private notifyTabs = () => {
    if (this.channel) this.channel.postMessage('changed');
    else {
      try { localStorage.setItem('hearthfire:drafts-changed', generateId()); } catch { /* IndexedDB is the durable store. */ }
    }
  };

  private persistVolatile = async (): Promise<void> => {
    const save = this.localChain.catch(() => {}).then(async () => {
      const drafts = [...this.volatile];
      if (!drafts.length) return;
      const confirmed = this.confirmedBase();
      this.queue = await changeQueue(this.gameId, (initial) => drafts.reduce((queue, original) => {
        const edit = { ...original };
        // A newer edit can arrive before React has rendered an earlier local
        // acceptance. Chain it after this writer's frozen assignment only.
        const sending = queue.sending;
        if (sending?.writer === this.writer && sending.generation === edit.generation) {
          edit.changes = edit.changes.map((change) => {
            const previous = sending.changes.find((c) => sameValue(c.path, change.path));
            return previous && sameValue(previous.before, change.before) ? { ...change, before: previous.after } : change;
          });
        }
        const pending = [...queue.pending];
        const last = pending[pending.length - 1];
        if (last && last.writer === this.writer && last.generation === edit.generation
          && last.notesKey === edit.notesKey && last.leaseToken === edit.leaseToken
          && !last.deltas && !edit.deltas && !last.order && !edit.order && !last.restore && !edit.restore) {
          const normalized = edit.changes.map((change) => {
            const previous = last.changes.find((c) => sameValue(c.path, change.path));
            return previous && sameValue(previous.before, change.before) ? { ...change, before: previous.after } : change;
          });
          pending[pending.length - 1] = { ...last, changes: composeChanges(last.changes, normalized), releaseLock: last.releaseLock || edit.releaseLock };
        } else pending.push(edit);
        return { ...queue, pending, cachedGame: confirmed && (!queue.cachedGame || nextSyncMetadata(confirmed).revision > nextSyncMetadata(queue.cachedGame).revision) ? confirmed : queue.cachedGame };
      }, initial));
      const ids = new Set(drafts.map((draft) => draft.id));
      this.volatile = this.volatile.filter((draft) => !ids.has(draft.id));
    });
    this.localChain = save;
    await save;
  };

  enqueue = async (base: RawGame, changes: FieldChange[], label: string, extra: Partial<DraftEdit> = {}): Promise<void> => {
    if (!changes.length && !extra.deltas && !extra.order && !extra.restore && !extra.releaseLock) return;
    const edit: DraftEdit = {
      id: generateId(), writer: this.writer, generation: gameGeneration(base), label, changes,
      createdAt: Date.now(), ...extra,
      ...(extra.restore ? { restoreRevision: nextSyncMetadata(base).revision - 1 } : {}),
      ...(extra.notesKey ? { notesClient: NOTES_CLIENT_ID } : {}),
    };
    this.volatile.push(edit);
    this.publish({ localWrites: this.state.localWrites + 1 });
    try {
      await this.ready;
      await this.persistVolatile();
      this.publish({ storageError: null });
      this.notifyTabs();
      this.schedule();
    } catch (error) {
      this.publish({ storageError: 'Could not preserve changes on this device. Keep this page open and retry.' });
      throw error;
    } finally { this.publish({ localWrites: this.state.localWrites - 1 }); }
  };

  private schedule = (delay = SEND_DELAY) => {
    clearTimeout(this.timer);
    if (!this.listeners.size || this.running || this.state.storageError || this.queue.conflict || this.queue.error || !navigator.onLine) return;
    if (this.queue.sending || this.queue.pending.length) this.timer = setTimeout(() => { void this.send(); }, delay);
  };

  private scheduleRetry = () => {
    if (this.retryTimer || !this.listeners.size || !navigator.onLine || !this.queue.retryable || this.queue.conflict) return;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.retryCount++, 5));
    this.retryTimer = setTimeout(() => { this.retryTimer = undefined; void this.retry(); }, delay);
  };

  // Concurrent tabs may send the same frozen batch. Its receipt is written in
  // the game transaction, so a second sender or a restart cannot replay it.
  send = (): Promise<void> => {
    if (this.sendingPromise) return this.sendingPromise;
    const attempt = this.sendBatch();
    this.sendingPromise = attempt;
    void attempt.finally(() => { this.sendingPromise = undefined; }).catch(() => {});
    return attempt;
  };

  private sendBatch = async (): Promise<void> => {
    if (this.running || !navigator.onLine) return;
    this.running = true;
    let edit: DraftEdit | undefined;
    try {
      await this.ready;
      this.queue = await changeQueue(this.gameId, (queue) => {
        if (queue.sending || queue.conflict || queue.error || !queue.pending.length) return queue;
        const [first, ...pending] = queue.pending;
        return { ...queue, sending: first, pending };
      });
      edit = this.queue.sending;
      if (!edit || this.queue.conflict || this.queue.error) return;
      const batch = edit;
      this.publish({ syncing: true });
      this.notifyTabs();
      const ref = doc(db, GAMES_COLLECTION, this.gameId);
      const receipt = doc(db, GAMES_COLLECTION, this.gameId, 'writes', batch.id);
      const committed = await runGameTransaction(ref, async (tx, observed) => {
        const done = await tx.get(receipt);
        const snapshot = await tx.get(ref);
        if (done.exists()) return snapshot.exists() ? snapshot.data() : null;
        if (!snapshot.exists()) throw new EditConflict('This game was deleted. Your draft is still on this device.');
        const raw = snapshot.data();
        observed(raw);
        if (isPlainObject(raw.sync) && Number(raw.sync.protocol) > SYNC_PROTOCOL) throw new Error('Reload Hearthfire before syncing.');
        let next = projectEdit(raw, batch, true);
        if (Array.isArray(next.diceRolls)) {
          next = { ...next, diceRolls: [...next.diceRolls].sort((a, b) => a.createdAt - b.createdAt).slice(-ROLL_LOG_CAP) };
        }
        if (batch.notesKey) {
          const key = batch.notesKey;
          const lock = isPlainObject(raw.notesLocks) ? raw.notesLocks[key] : undefined;
          const activeOther = isPlainObject(lock) && lock.clientId !== batch.notesClient && Date.now() - Number(lock.at) < NOTES_STALE_MS;
          const staleToken = batch.leaseToken && (!isPlainObject(lock) || lock.token !== batch.leaseToken);
          const changesContent = batch.changes.some((change) => !sameValue(readPath(raw, change.path), change.after));
          if ((activeOther || staleToken) && changesContent) throw new EditConflict('Someone else is editing these notes. Your draft is preserved.');
          if (batch.releaseLock && isPlainObject(lock) && lock.token === batch.leaseToken) {
            next = { ...next, notesLocks: { ...(isPlainObject(next.notesLocks) ? next.notesLocks : {}), [key]: null } };
          }
        }
        next = { ...next, sync: { ...nextSyncMetadata(raw, batch.restore ? batch.id : gameGeneration(raw)), lastWrite: batch.id } };
        if (batch.restore) tx.set(ref, next);
        else {
          const patch = Object.fromEntries(Object.entries(next).filter(([key, value]) => !sameValue(raw[key], value)));
          tx.update(ref, patch);
        }
        tx.set(receipt, { generation: batch.generation, committedAt: Date.now() });
        return next;
      });
      if (committed && this.remote && nextSyncMetadata(committed).revision > nextSyncMetadata(this.remote).revision) this.remote = committed;
      this.queue = await changeQueue(this.gameId, (queue) => queue.sending?.id === batch.id
        ? { ...queue, sending: undefined, error: undefined, retryable: undefined, lastSavedAt: Date.now(), cachedGame: committed } : queue);
      this.retryCount = 0;
    } catch (error) {
      if (edit) {
        const batch = edit;
        const code = isPlainObject(error) ? error.code : undefined;
        try {
          this.queue = await changeQueue(this.gameId, (queue) => queue.sending?.id !== batch.id ? queue : error instanceof EditConflict
            ? { ...queue, sending: undefined, conflict: batch, error: error.message, retryable: false }
            : { ...queue, retryable: ['unavailable', 'deadline-exceeded', 'aborted', 'unknown'].includes(String(code)),
              error: code === 'invalid-argument' ? INVALID_WRITE_MESSAGE : 'Could not sync. Your draft is preserved on this device. Retry after checking your connection.' });
        } catch {
          // The immutable batch remains durable even if local cleanup fails.
          // Its receipt makes the next attempt safe after a server commit.
          this.publish({ storageError: 'Could not update local drafts. Keep this page open and retry.' });
        }
      } else this.publish({ storageError: 'Could not read the saved drafts. Keep this page open and retry.' });
    } finally {
      this.running = false;
      this.publish({ syncing: false });
      this.notifyTabs();
      this.schedule(0);
      this.scheduleRetry();
    }
  };

  retry = async () => {
    clearTimeout(this.retryTimer); this.retryTimer = undefined;
    try {
      await this.persistVolatile();
      this.queue = await changeQueue(this.gameId, (queue) => ({ ...queue, error: queue.conflict ? queue.error : undefined, retryable: undefined }));
      this.publish({ storageError: null });
      this.notifyTabs();
      this.schedule(0);
    } catch { this.publish({ storageError: 'Could not access local drafts. Keep this page open.' }); }
  };

  resolveConflict = async (keepMine: boolean, reviewed: RawGame | null = this.confirmedBase()): Promise<void> => {
    const remote = reviewed;
    if (!remote) throw new Error('Load the shared game before resolving this draft.');
    this.queue = await changeQueue(this.gameId, (queue) => {
      const conflict = queue.conflict;
      if (!conflict) return queue;
      const rebased = { ...conflict, id: generateId(), generation: gameGeneration(remote), leaseToken: undefined,
        changes: conflict.changes.map((change) => ({ ...change, before: readPath(remote, change.path) })) };
      return { ...queue, conflict: undefined, error: undefined, retryable: undefined, pending: keepMine ? [rebased, ...queue.pending] : queue.pending };
    });
    this.publish(); this.notifyTabs(); this.schedule(0);
  };

  claimNotes = async (key: string): Promise<boolean> => {
    const token = generateId();
    this.claims.set(key, token);
    let claimed = false;
    const ref = doc(db, GAMES_COLLECTION, this.gameId);
    await runGameTransaction(ref, async (tx, observed) => {
      claimed = false;
      if (this.claims.get(key) !== token) return;
      const snapshot = await tx.get(ref);
      if (!snapshot.exists()) throw new Error('Game not found.');
      const raw = snapshot.data();
      observed(raw);
      const lock = isPlainObject(raw.notesLocks) ? raw.notesLocks[key] : undefined;
      if (isPlainObject(lock) && lock.clientId !== NOTES_CLIENT_ID && Date.now() - Number(lock.at) < NOTES_STALE_MS) return;
      tx.update(ref, { [`notesLocks.${key}`]: { clientId: NOTES_CLIENT_ID, token, at: Date.now() }, sync: nextSyncMetadata(raw) });
      claimed = true;
    });
    claimed = claimed && this.claims.get(key) === token;
    if (claimed) this.holds.set(key, token);
    return claimed;
  };

  notesToken = (key: string) => this.holds.get(key);
  forgetNotesToken = (key: string, token: string | undefined) => {
    if (this.holds.get(key) === token) this.holds.delete(key);
  };

  refreshNotes = async (key: string): Promise<void> => {
    const token = this.holds.get(key);
    if (!token) return;
    const ref = doc(db, GAMES_COLLECTION, this.gameId);
    await runGameTransaction(ref, async (tx, observed) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists()) return;
      const raw = snapshot.data();
      observed(raw);
      const lock = isPlainObject(raw.notesLocks) ? raw.notesLocks[key] : undefined;
      if (!isPlainObject(lock) || lock.token !== token) return;
      tx.update(ref, { [`notesLocks.${key}.at`]: Date.now(), sync: nextSyncMetadata(raw) });
    });
  };
}

const stores = new Map<string, GameSync>();
export const getGameSync = (gameId: string): GameSync => {
  let store = stores.get(gameId);
  if (!store) { store = new GameSync(gameId); stores.set(gameId, store); }
  return store;
};

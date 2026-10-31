import type { FieldChange } from './syncChanges';

export interface DraftEdit {
  id: string;
  writer: string;
  generation: string;
  label: string;
  changes: FieldChange[];
  // Events are never coalesced into assignments.
  deltas?: { characterId: string; values: Record<string, number> };
  order?: string[];
  restore?: Record<string, unknown>;
  restoreRevision?: number;
  notesKey?: string;
  notesClient?: string;
  leaseToken?: string;
  releaseLock?: boolean;
  createdAt: number;
}

export interface DraftQueue {
  gameId: string;
  pending: DraftEdit[];
  sending?: DraftEdit;
  conflict?: DraftEdit;
  error?: string;
  retryable?: boolean;
  lastSavedAt?: number;
  // Stored separately, so accepting a keystroke does not rewrite the game.
  cachedGame?: Record<string, unknown> | null;
}

export const emptyQueue = (gameId: string): DraftQueue => ({ gameId, pending: [] });

let database: Promise<IDBDatabase> | undefined;
const openDatabase = (): Promise<IDBDatabase> => database ??= new Promise((resolve, reject) => {
  const request = indexedDB.open('hearthfire-drafts', 2);
  request.onupgradeneeded = () => {
    for (const name of ['queues', 'forms', 'bases']) {
      if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, name === 'queues' ? { keyPath: 'gameId' } : undefined);
    }
  };
  request.onsuccess = () => {
    const db = request.result;
    db.onversionchange = () => { db.close(); database = undefined; };
    resolve(db);
  };
  request.onerror = () => { database = undefined; reject(request.error); };
  request.onblocked = () => { database = undefined; reject(new Error('Close older Hearthfire tabs and retry.')); };
});

// A short IndexedDB transaction serializes queue updates across tabs. Network
// requests never run inside it. Resolve only after the transaction commits.
export const changeQueue = async (gameId: string, update?: (queue: DraftQueue) => DraftQueue): Promise<DraftQueue> => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['queues', 'bases'], update ? 'readwrite' : 'readonly', { durability: 'strict' });
    const store = tx.objectStore('queues');
    let result: DraftQueue;
    const request = store.get(gameId);
    const cached = tx.objectStore('bases').get(gameId);
    cached.onsuccess = () => {
      try {
        result = { ...(request.result ?? emptyQueue(gameId)), cachedGame: cached.result };
        if (update) {
          result = update(result);
          const { cachedGame, ...queue } = result;
          store.put(queue);
          if (cachedGame !== cached.result) {
            if (cachedGame === undefined) tx.objectStore('bases').delete(gameId);
            else tx.objectStore('bases').put(cachedGame, gameId);
          }
        }
      } catch (error) { tx.abort(); reject(error); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Could not preserve this draft on the device.'));
  });
};

export const formDraft = async <T>(key: string, update?: { value: T } | { remove: true }): Promise<T | undefined> => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('forms', update ? 'readwrite' : 'readonly', { durability: 'strict' });
    const store = tx.objectStore('forms');
    const request = update ? 'remove' in update ? store.delete(key) : store.put(update.value, key) : store.get(key);
    tx.oncomplete = () => resolve(request.result as T | undefined);
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Could not preserve this form.'));
  });
};

export const listFormDrafts = async <T>(prefix: string): Promise<{ key: string; value: T }[]> => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('forms', 'readonly');
    const store = tx.objectStore('forms');
    const keys = store.getAllKeys();
    const values = store.getAll();
    tx.oncomplete = () => resolve(keys.result.flatMap((key, i) => typeof key === 'string' && key.startsWith(prefix) ? [{ key, value: values.result[i] as T }] : []));
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
};

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { firestoreMockModule, firestoreStore } from '@/test/firestoreMock';
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/firestore', () => firestoreMockModule());
import { GameSync } from '../gameSync';
import { changeQueue } from '../syncStorage';
import { diffValues } from '../syncChanges';
import { runTransaction } from 'firebase/firestore';

let count = 0;
let id: string;
const stops: (() => void)[] = [];
const base = { name: 'Game', createdAt: 0, characters: [], notes: { gm: 'Original' } };
beforeEach(() => {
  id = 'sync-test-' + ++count;
  firestoreStore.set('games/' + id, base);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
});
afterEach(() => { vi.restoreAllMocks(); stops.splice(0).forEach((stop) => stop()); Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); });
const client = async () => {
  const store = new GameSync(id);
  stops.push(store.subscribe(() => {}));
  await waitFor(() => expect(store.getSnapshot().loading).toBe(false));
  return store;
};
const send = async (store: GameSync) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  await store.send();
};

describe('durable synchronization', () => {
  it('recovers the latest of several offline drafts after the store restarts', async () => {
    const first = await client();
    await first.enqueue(base, diffValues(base.notes.gm, 'First', ['notes', 'gm']), 'Notes');
    await first.enqueue(first.getSnapshot().raw!, diffValues('First', 'Latest', ['notes', 'gm']), 'Notes');
    first.stop();
    const restarted = await client();
    await waitFor(() => expect(restarted.getSnapshot().game?.notes?.gm).toBe('Latest'));
    await send(restarted);
    expect(firestoreStore.get('games/' + id)?.notes).toEqual({ gm: 'Latest' });
    expect((await changeQueue(id)).pending).toHaveLength(0);
  });
  it('preserves competing drafts instead of overwriting the first commit', async () => {
    const a = await client();
    const b = await client();
    await a.enqueue(base, diffValues('Original', 'A', ['notes', 'gm']), 'Notes');
    await b.enqueue(base, diffValues('Original', 'B', ['notes', 'gm']), 'Notes');
    await send(a);
    await send(b);
    expect(firestoreStore.get('games/' + id)?.notes).toEqual({ gm: 'A' });
    expect((await changeQueue(id)).conflict?.changes[0].after).toBe('B');
  });
  it('preserves disjoint edits from stale clients', async () => {
    const a = await client();
    const b = await client();
    await a.enqueue(base, [{ path: ['name'], before: 'Game', after: 'New name' }], 'Name');
    await b.enqueue(base, [{ path: ['notes', 'gm'], before: 'Original', after: 'New notes' }], 'Notes');
    await send(a); await send(b);
    expect(firestoreStore.get('games/' + id)).toMatchObject({ name: 'New name', notes: { gm: 'New notes' } });
  });
  it('does not replay an acknowledged delta after a crash before local cleanup', async () => {
    firestoreStore.set('games/' + id, { ...base, characters: [{ id: 'a', name: 'A', playbook: 'heavy', level: 1, data: { statHp: '5' } }] });
    const store = await client();
    await store.enqueue(store.getSnapshot().raw!, [], 'HP', { deltas: { characterId: 'a', values: { statHp: -1 } } });
    const queued = (await changeQueue(id)).pending[0];
    await send(store);
    await changeQueue(id, (queue) => ({ ...queue, sending: queued }));
    await send(store);
    expect((firestoreStore.get('games/' + id)?.characters as { data: { statHp: string } }[])[0].data.statHp).toBe('4');
  });
  it('keeps newer typing durable while an earlier transaction is in flight', async () => {
    const store = await client();
    await store.enqueue(base, diffValues('Original', 'First', ['notes', 'gm']), 'Notes');
    const implementation = vi.mocked(runTransaction).getMockImplementation()!;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(runTransaction).mockImplementationOnce(async (...args) => { await held; return implementation(...args); });
    const first = send(store);
    await waitFor(() => expect(store.getSnapshot().syncing).toBe(true));
    await store.enqueue(store.getSnapshot().raw!, diffValues('First', 'Latest', ['notes', 'gm']), 'Notes');
    expect((await changeQueue(id)).pending[0].changes[0].after).toBe('Latest');
    release(); await first; await store.send();
    expect(firestoreStore.get('games/' + id)?.notes).toEqual({ gm: 'Latest' });
    expect((await changeQueue(id)).conflict).toBeUndefined();
  });
  it('serializes concurrent local acceptance without losing either tab’s edits', async () => {
    const a = await client(); const b = await client();
    await Promise.all([
      a.enqueue(base, diffValues('Game', 'Renamed', ['name']), 'Name'),
      b.enqueue(base, diffValues('Original', 'Typed', ['notes', 'gm']), 'Notes'),
    ]);
    expect((await changeQueue(id)).pending).toHaveLength(2);
    await send(a); await send(b);
    expect(firestoreStore.get('games/' + id)).toMatchObject({ name: 'Renamed', notes: { gm: 'Typed' } });
  });
  it('retains a storage failure in memory and persists it on retry', async () => {
    const store = await client();
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    await expect(store.enqueue(base, diffValues('Original', 'Recover me', ['notes', 'gm']), 'Notes')).rejects.toThrow();
    expect(store.getSnapshot().storageError).toBeTruthy();
    expect(store.getSnapshot().game?.notes?.gm).toBe('Recover me');
    expect(store.getRecovery().unpersisted).toHaveLength(1);
    put.mockRestore();
    await store.retry();
    expect(store.getSnapshot().storageError).toBeNull();
    expect((await changeQueue(id)).pending[0].changes[0].after).toBe('Recover me');
  });
  it('fences a stale release even when the same client reacquires the notes', async () => {
    const store = await client();
    await store.claimNotes('gm'); const oldToken = store.notesToken('gm');
    await store.claimNotes('gm');
    expect(store.notesToken('gm')).not.toBe(oldToken);
    expect(store.getSnapshot().queue.lastSavedAt).toBeUndefined();
    await store.enqueue(base, diffValues('Original', 'Stale release', ['notes', 'gm']), 'Notes', { notesKey: 'gm', leaseToken: oldToken, releaseLock: true });
    await send(store);
    expect(firestoreStore.get('games/' + id)?.notes).toEqual({ gm: 'Original' });
    expect((await changeQueue(id)).conflict?.changes[0].after).toBe('Stale release');
  });
  it('rejects drafts from before a restore and clears old notes locks', async () => {
    const store = await client();
    await store.enqueue(base, [], 'Restore', { restore: { ...base, notes: { gm: 'Restored' }, notesLocks: { gm: { clientId: 'old', at: 0 } } } });
    await send(store);
    expect(firestoreStore.get('games/' + id)?.notesLocks).toEqual({});
    await store.enqueue(base, diffValues('Original', 'Old draft', ['notes', 'gm']), 'Notes');
    await store.send();
    expect((await changeQueue(id)).conflict?.changes[0].after).toBe('Old draft');
    expect(firestoreStore.get('games/' + id)?.notes).toEqual({ gm: 'Restored' });
  });
  it('checks the version the user reviewed again before applying a conflict', async () => {
    const store = await client();
    await store.enqueue(base, diffValues('Original', 'Mine', ['notes', 'gm']), 'Notes');
    firestoreStore.set('games/' + id, { ...base, notes: { gm: 'Other' } });
    await send(store);
    const reviewed = store.getRemote();
    firestoreStore.set('games/' + id, { ...base, notes: { gm: 'Newer' } });
    await store.resolveConflict(true, reviewed); await store.send();
    expect((await changeQueue(id)).conflict?.changes[0].after).toBe('Mine');
    expect(firestoreStore.get('games/' + id)?.notes).toEqual({ gm: 'Newer' });
  });
  it('recovers the committed baseline when Firestore’s disk cache is older than the acknowledgment', async () => {
    const store = await client();
    await store.enqueue(base, diffValues('Original', 'Confirmed', ['notes', 'gm']), 'Notes');
    await send(store); store.stop();
    const restarted = await client();
    firestoreStore.emitCached('games/' + id, base);
    expect(restarted.getSnapshot().game?.notes?.gm).toBe('Confirmed');
    expect((await changeQueue(id)).pending).toHaveLength(0);
  });
  it('ignores an obsolete release with no content changes and preserves the newer hold', async () => {
    const store = await client();
    await store.claimNotes('gm'); const old = store.notesToken('gm');
    await store.claimNotes('gm'); const current = store.notesToken('gm');
    await store.enqueue(base, [], 'Release', { notesKey: 'gm', leaseToken: old, releaseLock: true });
    await send(store);
    expect((await changeQueue(id)).conflict).toBeUndefined();
    expect(firestoreStore.get('games/' + id)?.notesLocks).toMatchObject({ gm: { token: current } });
  });

});

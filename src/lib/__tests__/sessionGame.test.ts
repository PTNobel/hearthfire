import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getSessionGameId, saveSessionGameId, clearSessionGameId, requireSessionGameId, subscribeSessionGameId } from '../sessionGame';

const storageKey = 'hearthfire:session-game-id';

describe('remembered session ID', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('is absent until a user opens a game', () => {
    expect(getSessionGameId()).toBeNull();
    expect(() => requireSessionGameId()).toThrow(/Session ID is missing/);
  });

  it('persists through reads but does not alter the URL', () => {
    const originalUrl = window.location.href;
    saveSessionGameId('four-random-fantasy-words');
    expect(localStorage.getItem(storageKey)).toBe('four-random-fantasy-words');
    sessionStorage.clear(); // A fresh tab does not inherit the old tab's storage.
    expect(requireSessionGameId()).toBe('four-random-fantasy-words');
    expect(window.location.href).toBe(originalUrl);
    clearSessionGameId();
    expect(getSessionGameId()).toBeNull();
  });

  it('rejects an empty ID', () => {
    expect(() => saveSessionGameId('')).toThrow(/must not be empty/);
  });

  it('migrates an existing tab session into remembered access', () => {
    sessionStorage.setItem(storageKey, 'existing-game');
    expect(getSessionGameId()).toBe('existing-game');
    expect(localStorage.getItem(storageKey)).toBe('existing-game');
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it('prefers the remembered game over an older tab credential', () => {
    saveSessionGameId('new-game');
    sessionStorage.setItem(storageKey, 'old-game');
    expect(getSessionGameId()).toBe('new-game');
  });

  it('does not restore a forgotten game from another tab’s legacy storage', () => {
    saveSessionGameId('old-game');
    clearSessionGameId();
    sessionStorage.setItem(storageKey, 'old-game');
    expect(getSessionGameId()).toBeNull();
    expect(localStorage.getItem(storageKey)).toBe('');
    saveSessionGameId('new-game');
    expect(getSessionGameId()).toBe('new-game');
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it('notifies subscribers of same-tab writes and relevant changes from other tabs', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSessionGameId(listener);
    try {
      saveSessionGameId('remembered-game');
      clearSessionGameId();
      expect(listener).toHaveBeenCalledTimes(2);
      window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', storageArea: localStorage }));
      window.dispatchEvent(new StorageEvent('storage', { key: storageKey, storageArea: sessionStorage }));
      expect(listener).toHaveBeenCalledTimes(2);
      window.dispatchEvent(new StorageEvent('storage', { key: storageKey, storageArea: localStorage }));
      window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
      expect(listener).toHaveBeenCalledTimes(4);
    } finally { unsubscribe(); }
    clearSessionGameId();
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('returns no credential when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect(getSessionGameId()).toBeNull();
  });
});

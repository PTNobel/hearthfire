import { describe, it, expect, beforeEach } from 'vitest';
import { getSessionGameId, saveSessionGameId, clearSessionGameId, requireSessionGameId } from '../sessionGame';

describe('session ID in tab storage', () => {
  beforeEach(() => clearSessionGameId());

  it('is absent until a user opens a game', () => {
    expect(getSessionGameId()).toBeNull();
    expect(() => requireSessionGameId()).toThrow(/Session ID is missing/);
  });

  it('persists through reads but does not alter the URL', () => {
    const originalUrl = window.location.href;
    saveSessionGameId('four-random-fantasy-words');
    expect(requireSessionGameId()).toBe('four-random-fantasy-words');
    expect(window.location.href).toBe(originalUrl);
    clearSessionGameId();
    expect(getSessionGameId()).toBeNull();
  });

  it('rejects an empty ID', () => {
    expect(() => saveSessionGameId('')).toThrow(/must not be empty/);
  });
});

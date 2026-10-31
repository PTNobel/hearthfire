// The game ID is a bearer credential; never put it in navigation URLs.
const STORAGE_KEY = 'hearthfire:session-game-id';

export const getSessionGameId = (): string | null => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
};

export const saveSessionGameId = (id: string): void => {
  if (!id) throw new Error('Session ID must not be empty.');
  window.sessionStorage.setItem(STORAGE_KEY, id);
};

export const clearSessionGameId = (): void => {
  window.sessionStorage.removeItem(STORAGE_KEY);
};

export const requireSessionGameId = (): string => {
  const id = getSessionGameId();
  if (!id) throw new Error('Session ID is missing. Open a game from the home page.');
  return id;
};

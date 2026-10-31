// The game ID is a bearer credential; never put it in navigation URLs.
const STORAGE_KEY = 'hearthfire:session-game-id';
const CHANGE_EVENT = 'hearthfire:session-change';

export const getSessionGameId = (): string | null => {
  try {
    const remembered = window.localStorage.getItem(STORAGE_KEY);
    if (remembered !== null) return remembered || null;
    // Carry an existing tab session forward once. An empty local value means
    // explicitly forgotten, so an older tab cannot restore its stale credential.
    const legacy = window.sessionStorage.getItem(STORAGE_KEY);
    if (legacy) {
      window.localStorage.setItem(STORAGE_KEY, legacy);
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
    return legacy || null;
  } catch {
    return null;
  }
};

export const saveSessionGameId = (id: string): void => {
  if (!id) throw new Error('Session ID must not be empty.');
  window.localStorage.setItem(STORAGE_KEY, id);
  window.sessionStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const clearSessionGameId = (): void => {
  // Keep a non-secret tombstone to prevent migration from another old tab.
  window.localStorage.setItem(STORAGE_KEY, '');
  window.sessionStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const subscribeSessionGameId = (listener: () => void): (() => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea === window.localStorage && (event.key === STORAGE_KEY || event.key === null)) listener();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
};

export const requireSessionGameId = (): string => {
  const id = getSessionGameId();
  if (!id) throw new Error('Session ID is missing. Open a game from the home page.');
  return id;
};

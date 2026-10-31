// The playbook move filter is a local viewing preference, not part of the
// shared character state. Never hide unselected moves by default.
const STORAGE_PREFIX = 'hearthfire:selected-moves-only:';

export const selectedMovesPreferenceKey = (gameId: string, characterId: string): string =>
  STORAGE_PREFIX + encodeURIComponent(gameId) + ':' + encodeURIComponent(characterId);

export const readSelectedMovesOnly = (gameId: string, characterId: string): boolean => {
  try {
    return window.localStorage.getItem(selectedMovesPreferenceKey(gameId, characterId)) === '1';
  } catch {
    return false;
  }
};

export const writeSelectedMovesOnly = (gameId: string, characterId: string, selectedOnly: boolean): void => {
  try {
    window.localStorage.setItem(selectedMovesPreferenceKey(gameId, characterId), selectedOnly ? '1' : '0');
  } catch {
    // Browsers can disable site storage; the toggle still works until unmount.
  }
};

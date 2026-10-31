// The playbook move filter is a local viewing preference, not part of the
// shared character state. Never hide unselected moves by default.
// Session IDs are bearer credentials, so never retain them in preference keys.
// Character IDs are random UUIDs and survive character backup/restore.
const STORAGE_PREFIX = 'hearthfire:selected-moves-only:';

export const selectedMovesPreferenceKey = (characterId: string): string =>
  STORAGE_PREFIX + encodeURIComponent(characterId);

export const readSelectedMovesOnly = (characterId: string): boolean => {
  try {
    return window.localStorage.getItem(selectedMovesPreferenceKey(characterId)) === '1';
  } catch {
    return false;
  }
};

export const writeSelectedMovesOnly = (characterId: string, selectedOnly: boolean): void => {
  try {
    window.localStorage.setItem(selectedMovesPreferenceKey(characterId), selectedOnly ? '1' : '0');
  } catch {
    // Browsers can disable site storage; the toggle still works until unmount.
  }
};

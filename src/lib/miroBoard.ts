/**
 * The Miro board URL is public configuration, not a secret. Access must be
 * controlled by Miro itself, not by hiding the link inside Hearthfire.
 */
export const parseMiroBoardUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const path = url.pathname.split('/').filter(Boolean);
    const isBoard = path[0] === 'app' && path[1] === 'board' && path.length >= 3;
    const isInvitation = path[0] === 'welcomeonboard' && path.length >= 2;
    if (
      url.protocol !== 'https:' ||
      (url.hostname !== 'miro.com' && url.hostname !== 'www.miro.com') ||
      url.username || url.password ||
      (!isBoard && !isInvitation)
    ) return null;
    return url.href;
  } catch {
    return null;
  }
};

export const getConfiguredMiroBoardUrl = (): string | null =>
  parseMiroBoardUrl(import.meta.env.VITE_MIRO_BOARD_URL);

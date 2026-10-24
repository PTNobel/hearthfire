import type { CharacterData } from '@/types';

// Times a repeatable move has been taken: the select box counts as the first take, and each
// checked take box (bitmask, see Move.tsx) as another.
export const moveTakeCount = (data: CharacterData | undefined, moveId: string): number => {
  if (!data?.typeMoves?.[moveId]) return 0;
  const takes = data.typeMoveTakes?.[moveId] ?? 0;
  return 1 + takes.toString(2).replace(/0/g, '').length;
};

import type { CharacterData } from '@/types';

const BIG_MAGIC_ID = 'blessed-big-magic';

// Times the Blessed has taken Big Magic: the select box counts as the first take, and each
// checked take box (bitmask, see Move.tsx) as another.
export const bigMagicCount = (data: CharacterData | undefined): number => {
  if (!data?.typeMoves?.[BIG_MAGIC_ID]) return 0;
  const takes = data.typeMoveTakes?.[BIG_MAGIC_ID] ?? 0;
  return 1 + takes.toString(2).replace(/0/g, '').length;
};

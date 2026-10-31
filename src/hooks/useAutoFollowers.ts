import { useEffect, useRef } from 'react';
import { FOLLOWERS_INSERT_ID } from '@/lib/insertTabs';
import type { CharacterData } from '@/types';

const DOG_POSSESSION_IDS = new Set(['mastiffs', 'hounds', 'good-dog']);

export const useAutoFollowers = (
  specialPossessions: CharacterData['specialPossessions'],
  inserts: string[] | undefined,
  onSave: (data: Partial<CharacterData>, base?: Partial<CharacterData>) => Promise<void>,
) => {
  const hasAutoAddedRef = useRef(false);

  useEffect(() => {
    if (hasAutoAddedRef.current) return;
    const possessions = specialPossessions ?? {};
    const hasDog = Object.entries(possessions).some(([id, checked]) => checked && DOG_POSSESSION_IDS.has(id));
    if (!hasDog) return;
    const current = inserts ?? [];
    if (current.includes(FOLLOWERS_INSERT_ID)) return;
    hasAutoAddedRef.current = true;
    onSave({ inserts: [...current, FOLLOWERS_INSERT_ID] }).catch(() => {
      hasAutoAddedRef.current = false;
    });
  }, [specialPossessions, inserts, onSave]);
};

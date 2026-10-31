import { useLatest } from './useLatest';
import { useOptimisticField } from './useOptimisticField';
import type { CharacterData } from '@/types';
import { useRef } from 'react';

export const useCharacterField = <K extends keyof CharacterData>(
  key: K,
  firestoreValue: NonNullable<CharacterData[K]>,
  onSave: (data: Partial<CharacterData>, base?: Partial<CharacterData>) => Promise<void>,
  errorMsg: string,
) => {
  const onSaveRef = useLatest(onSave);
  const baseRef = useRef(firestoreValue);
  return useOptimisticField(
    firestoreValue,
    (next) => onSaveRef.current({ [key]: next } as Partial<CharacterData>, { [key]: baseRef.current } as Partial<CharacterData>),
    errorMsg,
    undefined, baseRef,
  );
};

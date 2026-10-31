import { useLatest } from './useLatest';
import { useOptimisticField } from './useOptimisticField';
import type { PlaybookFeatures } from '@/types';
import { useRef } from 'react';

export const usePlaybookField = <K extends keyof PlaybookFeatures>(
  key: K,
  firestoreValue: NonNullable<PlaybookFeatures[K]>,
  saveImmediate: (patch: Partial<PlaybookFeatures>, base?: Partial<PlaybookFeatures>) => Promise<void>,
  errorMsg: string,
) => {
  const saveImmediateRef = useLatest(saveImmediate);
  const baseRef = useRef(firestoreValue);
  return useOptimisticField(
    firestoreValue,
    (next) => saveImmediateRef.current({ [key]: next } as Partial<PlaybookFeatures>, { [key]: baseRef.current } as Partial<PlaybookFeatures>),
    errorMsg,
    undefined, baseRef,
  );
};

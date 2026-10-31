import { useRef, useCallback, useState } from 'react';
import { useGameSyncOptional } from '@/components/app/SaveStatus/GameSyncContext';
import { useLatest } from '@/hooks/useLatest';
import { featurePatch } from '@/lib/resolvePlaybookFeatures';
import type { CharacterData } from '@/types';

type Patch = Parameters<typeof featurePatch>[1];

export const useCrewSave = (data: CharacterData | undefined, onSave: (data: Partial<CharacterData>, base?: Partial<CharacterData>) => Promise<void>) => {
  const durable = !!useGameSyncOptional();
  const onSaveRef = useLatest(onSave);
  const dataRef = useLatest(data);
  const pendingRef = useRef(false);
  const activeRef = useRef(0);
  const revisionRef = useRef(0);
  const failedRef = useRef(false);
  const [resolvedTick, setResolvedTick] = useState(0);

  const saveImmediate = useCallback((patch: Patch, base?: Patch): Promise<void> => {
    const revision = ++revisionRef.current;
    activeRef.current++;
    pendingRef.current = true;
    const attempt = onSaveRef.current(featurePatch(dataRef.current, patch), base ? featurePatch(dataRef.current, base) : undefined)
      .then(() => { if (revision === revisionRef.current) failedRef.current = false; }, (error) => {
        if (revision === revisionRef.current) failedRef.current = !durable;
        throw error;
      }).finally(() => {
        activeRef.current--;
        pendingRef.current = activeRef.current > 0 || failedRef.current;
        setResolvedTick((tick) => tick + 1);
      });
    void attempt.catch(() => {});
    return attempt;
  }, [dataRef, onSaveRef, durable]);

  const saveDebounced = useCallback((patch: Patch, onError?: (error: unknown) => void) => {
    void saveImmediate(patch).catch((error) => onError?.(error));
  }, [saveImmediate]);
  const flushDebounce = useCallback((patch: Patch) => saveImmediate(patch).then(() => {
    window.dispatchEvent(new Event('hearthfire:flush'));
  }), [saveImmediate]);
  return { saveDebounced, saveImmediate, flushDebounce, dataRef, onSaveRef, pendingRef, resolvedTick };
};

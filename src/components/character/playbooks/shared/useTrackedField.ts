import { useState, useCallback } from 'react';
import { useLatest } from '@/hooks/useLatest';
import { useToast } from '@/components/app';
import type { PlaybookFeatures } from '@/types';

export const useTrackedField = (
  initialValue: string,
  fieldKey: keyof PlaybookFeatures,
  saveDebounced: (patch: Partial<PlaybookFeatures>, onError?: (err: unknown) => void) => void,
  flushDebounce: (patch: Partial<PlaybookFeatures>, base?: Partial<PlaybookFeatures>) => Promise<void>,
  errorMsg = 'Failed to save.',
) => {
  const { addToast } = useToast();
  const [value, setValue] = useState(initialValue);
  const valueRef = useLatest(value);
  // Every hand-rolled version of these two handlers toasts on failure; this hook
  // used to be the one place that swallowed it, so a failed crew/companion write
  // looked identical to a successful one.
  const onErrorRef = useLatest(() => addToast(errorMsg, 'error'));
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValue(val);
    saveDebounced({ [fieldKey]: val }, () => onErrorRef.current());
  }, [fieldKey, saveDebounced, onErrorRef]);
  const handleBlur = useCallback(() => {
    flushDebounce({ [fieldKey]: valueRef.current }).catch(() => onErrorRef.current());
  }, [fieldKey, flushDebounce, valueRef, onErrorRef]);
  return { value, setValue, handleChange, handleBlur };
};

import { useState, useCallback } from 'react';
import { useDebouncedSave } from './useDebouncedSave';
import { useFirestoreSync } from './useFirestoreSync';

// Shared text state: accept each change locally, request network flush on blur,
// and defer incoming values only while local acceptance is in flight.
export const useDebouncedTextField = (
  firestoreValue: string,
  save: (value: string) => Promise<void>,
  delay = 1500,
) => {
  const [value, setValue] = useState(firestoreValue);
  const { onChange: debouncedChange, flush, isPendingRef, noteRemoteValue } = useDebouncedSave(save, delay);

  // Shares the app's one remote-sync gate, which also *defers* a value that lands
  // mid-save and flushes it once the save settles — the hand-rolled guard this
  // replaced returned early and dropped that value outright (#171).
  useFirestoreSync(firestoreValue, (remote) => {
    // Not pending, so this is an authoritative remote value (not our own echo).
    // Tell the debounce hook so a value another client overwrote can be re-saved
    // if the user types it again, instead of being deduped away.
    noteRemoteValue(remote);
    setValue(remote);
  }, isPendingRef);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValue(e.target.value);
    debouncedChange(e.target.value);
  }, [debouncedChange]);

  const onBlur = useCallback((e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    flush(e.target.value);
  }, [flush]);

  return { value, onChange, onBlur };
};

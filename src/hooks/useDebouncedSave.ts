import { useRef, useCallback, useEffect, useState, useId, type MutableRefObject } from 'react';
import { useToastOptional } from '@/components/app/Toast/ToastContext';
import { useSaveStatusActionsOptional } from '@/components/app/SaveStatus/SaveStatusContext';
import { useLatest } from './useLatest';
import { SAVE_ERROR_MESSAGE } from '@/lib/constants';
import { useGameSyncOptional } from '@/components/app/SaveStatus/GameSyncContext';

interface UseDebouncedSaveReturn<T> {
  onChange: (value: T) => void;
  flush: (value: T) => Promise<void>;
  isPending: boolean;
  isPendingRef: MutableRefObject<boolean>;
  noteRemoteValue: (value: T) => void;
}

// Persist every edit locally. Network debouncing belongs to the durable queue,
// not a timer/promise chain that disappears with the page. The delay parameter
// remains for existing callers; GameSync coalesces their unsent assignments.
export const useDebouncedSave = <T>(
  onSave: (value: T) => Promise<void>,
  _delay = 1500,
  onError?: (error: unknown) => void,
  onSuccess?: (value: T) => void,
): UseDebouncedSaveReturn<T> => {
  const onSaveRef = useLatest(onSave);
  const onErrorRef = useLatest(onError);
  const onSuccessRef = useLatest(onSuccess);
  const toastRef = useLatest(useToastOptional());
  const statusRef = useLatest(useSaveStatusActionsOptional());
  const draftId = useId();
  const durable = !!useGameSyncOptional();
  const revision = useRef(0);
  const pendingCount = useRef(0);
  const failed = useRef(false);
  const [isPending, setIsPending] = useState(false);
  const isPendingRef = useRef(false);

  const pending = useCallback((value: boolean) => {
    isPendingRef.current = value;
    setIsPending(value);
    statusRef.current?.reportDraft(draftId, value);
  }, [draftId, statusRef]);

  const save = useCallback((value: T): Promise<void> => {
    const current = ++revision.current;
    pendingCount.current++;
    pending(true);
    // Invoke immediately: this records the base value before another snapshot
    // can replace it. A pending network request never blocks this call.
    let attempt: Promise<void>;
    try { attempt = onSaveRef.current(value); }
    catch (error) { attempt = Promise.reject(error); }
    return Promise.resolve(attempt).then(() => {
      if (current === revision.current) {
        failed.current = false;
        onSuccessRef.current?.(value);
      }
    }, (error) => {
      // An earlier value was superseded by a later local acceptance.
      // Do not show a stale error for a field whose latest edit succeeded.
      if (current === revision.current) {
        failed.current = !durable;
        if (onErrorRef.current) onErrorRef.current(error);
        else toastRef.current?.addToast(SAVE_ERROR_MESSAGE, 'error');
      }
    }).finally(() => {
      pendingCount.current--;
      if (pendingCount.current === 0 && !failed.current) pending(false);
    });
  }, [pending, onSaveRef, onSuccessRef, onErrorRef, toastRef, durable]);

  const onChange = useCallback((value: T) => { void save(value); }, [save]);
  const flush = useCallback((value: T) => save(value).then(() => {
    window.dispatchEvent(new Event('hearthfire:flush'));
  }), [save]);

  useEffect(() => () => { statusRef.current?.reportDraft(draftId, false); }, [draftId, statusRef]);

  // There is no historical-value dedupe: the mutation layer compares against
  // the actual draft baseline, so deliberately restoring an old value works.
  const noteRemoteValue = useCallback((_value: T) => {}, []);
  return { onChange, flush, isPending, isPendingRef, noteRemoteValue };
};

import { useState, useRef, useCallback, useMemo, type ReactNode } from 'react';
import {
  SaveStatusContext,
  SaveStatusActionsContext,
  type SaveStatusContextValue,
  type SaveStatusState,
} from './SaveStatusContext';

/*
 * SaveStatusProvider — app-wide aggregator for Firestore write activity.
 *
 * useGame's reportSave wrapper reports start/settle here for every write. Saves
 * are reference-counted (activeRef) so a character sheet with many fields
 * writing at once surfaces as a single "Saving…" state, dropping to "Saved"
 * only when the last in-flight write settles.
 *
 * Detailed errors appear in notifications; this provider keeps failure and
 * unsaved-draft state visible without claiming that a partial save succeeded.
 */
export const SaveStatusProvider = ({ children }: { children: ReactNode }) => {
  const [{ status, lastSavedAt }, setState] = useState<{
    status: SaveStatusState;
    lastSavedAt: number | null;
  }>({ status: 'idle', lastSavedAt: null });
  // Count of saves currently in flight across all hook instances.
  const activeRef = useRef(0);
  const batchFailedRef = useRef(false);
  const draftsRef = useRef(new Set<string>());
  const [pendingEdits, setPendingEdits] = useState(0);

  const reportDraft = useCallback((id: string, pending: boolean) => {
    if (pending) draftsRef.current.add(id);
    else draftsRef.current.delete(id);
    setPendingEdits(draftsRef.current.size);
  }, []);

  const reportSaveStart = useCallback(() => {
    activeRef.current += 1;
    if (activeRef.current === 1) batchFailedRef.current = false;
    setState((prev) => prev.status === 'saving' ? prev : { ...prev, status: 'saving' });
  }, []);

  const reportSaveSettled = useCallback((succeeded: boolean) => {
    if (activeRef.current > 0) activeRef.current -= 1;
    if (!succeeded) batchFailedRef.current = true;
    if (activeRef.current === 0) {
      if (!batchFailedRef.current) {
        // Date.now is read at settle time, not render time, so the timestamp
        // reflects when the write actually committed.
        setState({ status: 'saved', lastSavedAt: Date.now() });
      } else {
        // A successful sibling write must never hide a failure in the batch.
        setState((prev) => ({ ...prev, status: 'error' }));
      }
    }
  }, []);

  const actions = useMemo(
    () => ({ reportSaveStart, reportSaveSettled, reportDraft }),
    [reportSaveStart, reportSaveSettled, reportDraft],
  );

  const value = useMemo<SaveStatusContextValue>(
    () => ({ status, lastSavedAt, pendingEdits, ...actions }),
    [status, lastSavedAt, pendingEdits, actions],
  );

  return (
    <SaveStatusActionsContext.Provider value={actions}>
      <SaveStatusContext.Provider value={value}>
        {children}
      </SaveStatusContext.Provider>
    </SaveStatusActionsContext.Provider>
  );
};

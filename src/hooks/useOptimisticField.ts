import { useState, useRef, useCallback, type MutableRefObject } from 'react';
import { useLatest } from './useLatest';
import { useFirestoreSync } from './useFirestoreSync';
import { useToast } from '@/components/app';
import { useGameSyncOptional } from '@/components/app/SaveStatus/GameSyncContext';

/**
 * Optimistic local-state field backed by a Firestore write. The single field
 * hook used across the PC, Steading, and GM playbook pages.
 *
 * `save` accepts EITHER a next value or a transform `(current) => next`. The
 * transform form computes the new value from the freshest state (so concurrent
 * edits don't clobber each other) and captures the pre-save snapshot from that
 * same callback as the edit baseline. Value callers pass the value directly.
 *
 * Extra args after the value/transform are forwarded verbatim to `saveFn`, so a
 * caller can persist a narrower patch than the full value (e.g. only the toggled
 * key of a record) while keeping failed work available locally.
 *
 * `save` returns the underlying promise so callers can chain off settlement.
 *
 * Concurrency: an internal counter tracks in-flight saves so overlapping writes
 * can't let a remote echo clobber in-flight local state. `pendingRef` (returned)
 * is a boolean mirror consumed by `useFirestoreSync` to defer remote echoes while
 * a save is pending; callers that drive combined saves may set it directly.
 */
export const useOptimisticField = <T, A extends unknown[] = []>(
  firestoreValue: T,
  saveFn: (value: T, ...args: A) => Promise<unknown>,
  errorMsg = 'Failed to save.',
  // Optional caller-owned gate, ORed with the save-pending gate to hold remote
  // syncs. For fields whose edits aren't written until blur: a *different* field's
  // save can settle while a text input is still focused, and that settlement must
  // not drop the hold and let an echo clobber the in-flight typing.
  holdRef?: MutableRefObject<boolean>,
  // Array/form callers pass their original value explicitly to the mutation
  // layer, so untouched entries cannot be mistaken for edits.
  editBaseRef?: MutableRefObject<T>,
) => {
  const { addToast } = useToast();
  const durable = !!useGameSyncOptional();
  const addToastRef = useLatest(addToast);
  const saveFnRef = useLatest(saveFn);
  const errorMsgRef = useLatest(errorMsg);
  // Counter: governs save bookkeeping and overlapping-save safety.
  const pendingCountRef = useRef(0);
  const revisionRef = useRef(0);
  const failedRef = useRef(false);
  // Boolean mirror: what useFirestoreSync reads to defer remote echoes. Kept as
  // a separate boolean (not the counter) because some callers set it directly.
  const pendingRef = useRef(false);
  const [value, setValue] = useState<T>(firestoreValue);
  const ref = useLatest(value);
  // Bumped when a save resolves so the component re-renders and useFirestoreSync
  // can flush a remote value that arrived (and was deferred) mid-save.
  const [, setSaveTick] = useState(0);

  useFirestoreSync(firestoreValue, setValue, () => pendingRef.current || !!holdRef?.current);

  const save = useCallback((next: T | ((current: T) => T), ...args: A): Promise<void> => {
    // Compute from the freshest committed value via the ref — NOT inside the
    // setValue updater. React batches the updater and may run it after this
    // function returns (and twice under StrictMode), so reading `updated` off it
    // synchronously would pass `undefined` to saveFn.
    const prev = ref.current;
    if (editBaseRef) editBaseRef.current = prev;
    const updated = typeof next === 'function' ? (next as (c: T) => T)(prev) : next;
    ref.current = updated;
    setValue(updated);
    const revision = ++revisionRef.current;
    pendingCountRef.current += 1;
    pendingRef.current = true;
    let saved: Promise<unknown>;
    try { saved = saveFnRef.current(updated, ...args); }
    catch (error) { saved = Promise.reject(error); }
    const attempt = Promise.resolve(saved)
      .then(() => { if (revision === revisionRef.current) failedRef.current = false; })
      .catch((error) => {
        // Preserve failed work. Rolling back to another optimistic value can
        // present an earlier failed edit as if it had been confirmed.
        if (revision === revisionRef.current) {
          failedRef.current = !durable;
          addToastRef.current(errorMsgRef.current, 'error');
        }
        // Preserve the rejection contract for anyone explicitly awaiting
        // this particular call, even when its UI notification is obsolete.
        throw error;
      })
      .finally(() => {
        pendingCountRef.current -= 1;
        if (pendingCountRef.current === 0 && !failedRef.current) pendingRef.current = false;
        setSaveTick((t) => t + 1);
      });
    // Event handlers may intentionally ignore settlement; awaited callers still
    // receive the rejection and can keep their form open.
    void attempt.catch(() => {});
    return attempt;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { value, ref, setValue, save, pendingRef };
};

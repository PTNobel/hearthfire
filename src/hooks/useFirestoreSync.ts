import { type MutableRefObject, useEffect, useRef } from 'react';

export const useFirestoreSync = <T>(
  firestoreValue: T,
  setter: (value: T) => void,
  // A ref covers the common case (one save-pending flag). The predicate form lets a
  // caller combine gates — e.g. save-pending OR a text field still focused — without
  // reaching in and writing to someone else's pendingRef.
  pending?: MutableRefObject<boolean> | (() => boolean),
): void => {
  const isPending = () => (typeof pending === 'function' ? pending() : !!pending?.current);
  const lastRef = useRef<string | undefined>(undefined);
  // Holds a remote value that arrived while a save was pending, so we can flush
  // it once the save clears instead of losing a concurrent multi-device edit.
  const deferredRef = useRef<{ value: T; serialized: string } | null>(null);

  useEffect(() => {
    const serialized = JSON.stringify(firestoreValue);
    if (serialized === lastRef.current) {
      // The server can return to the previously applied value while we are
      // editing. That newer snapshot supersedes an intermediate deferred one.
      deferredRef.current = null;
      return;
    }
    // While a local save is pending, defer the incoming value rather than
    // applying it (which would clobber the optimistic local state with the echo
    // of our own in-flight write). We remember it so the next snapshot — or a
    // re-render after the save clears — can flush it.
    if (isPending()) {
      deferredRef.current = { value: firestoreValue, serialized };
      return;
    }
    lastRef.current = serialized;
    deferredRef.current = null;
    setter(firestoreValue);
  }, [firestoreValue]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Flush a value that was deferred during a save once the save resolves and
    // no newer remote value has superseded it.
    if (isPending()) return;
    const deferred = deferredRef.current;
    if (deferred && deferred.serialized !== lastRef.current) {
      lastRef.current = deferred.serialized;
      deferredRef.current = null;
      setter(deferred.value);
    }
  });
};

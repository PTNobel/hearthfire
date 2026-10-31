import { useState, useRef, useCallback, useEffect } from 'react';
import { formDraft, listFormDrafts } from '@/lib/syncStorage';
import { generateId } from '@/lib/id';
import { getSessionGameId } from '@/lib/sessionGame';
import { useLatest } from './useLatest';
import { useSaveStatusActionsOptional } from '@/components/app/SaveStatus/SaveStatusContext';

interface FormRecord<T> { value: T; base: T; at: number; recordId: string }

// Each open form owns a unique record. Two tabs never write the same draft.
// Recovering a previous form is explicit, and retains its original edit base.
export const useFormDraft = <T>(scope: string, initial: T, active: boolean) => {
  const [prefix] = useState(() => (getSessionGameId() ?? 'local') + ':' + scope + ':');
  const [key] = useState(() => prefix + generateId());
  const status = useSaveStatusActionsOptional();
  const recordId = useRef(key.slice(prefix.length));
  const [value, setValue] = useState(initial);
  const currentRef = useLatest(value);
  const base = useRef(initial);
  const chain = useRef(Promise.resolve());
  const revision = useRef(0);
  const unsaved = useRef(false);
  const [recoveries, setRecoveries] = useState<{ key: string; value: FormRecord<T> }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (unsaved.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  useEffect(() => () => { status?.reportDraft(key, false); }, [key, status]);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    void listFormDrafts<FormRecord<T>>(prefix).then((drafts) => {
      if (mounted) setRecoveries(drafts.filter((draft) => draft.key !== key).sort((a, b) => b.value.at - a.value.at));
    }).catch(() => { if (mounted) setError('Could not load local drafts.'); });
    return () => { mounted = false; };
  }, [active, prefix, key]);

  const change = useCallback((next: T | ((previous: T) => T)) => {
    const updated = typeof next === 'function' ? (next as (previous: T) => T)(currentRef.current) : next;
    currentRef.current = updated;
    setValue(updated);
    setSaving(true);
    status?.reportDraft(key, true);
    unsaved.current = true;
    const current = ++revision.current;
    const record = { value: updated, base: base.current, at: Date.now(), recordId: recordId.current };
    chain.current = chain.current.catch(() => {}).then(async () => {
      await formDraft(key, { value: record });
    });
    void chain.current.then(() => {
      if (current === revision.current) { unsaved.current = false; setError(null); setSaving(false); }
    }, () => {
      if (current === revision.current) { setError('Could not preserve this draft. Keep the form open and retry.'); setSaving(false); }
    });
  }, [currentRef, key, status]);

  const restore = useCallback((draft: { key: string; value: FormRecord<T> }) => {
    base.current = draft.value.base;
    recordId.current = draft.value.recordId;
    change(draft.value.value);
    setRecoveries([]);
  }, [change]);

  const clear = useCallback(async () => {
    await chain.current;
    await formDraft(key, { remove: true });
    status?.reportDraft(key, false);
    // The source remains recoverable in another tab. Deleting its record here
    // could erase an active form's only durable copy.
  }, [key, status]);

  const discard = useCallback(async (draftKey: string) => {
    try {
      await formDraft(draftKey, { remove: true });
      setRecoveries((drafts) => drafts.filter((draft) => draft.key !== draftKey));
    } catch { setError('Could not discard this saved draft.'); }
  }, []);

  return { value, change, base, recordId, recoveries, restore, discard, clear, error, saving };
};

import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { Icon, Text } from '@/components/ui';
import { useSaveStatusOptional } from './SaveStatusContext';
import styles from './SaveStatus.module.css';
import { useGameSyncOptional } from './GameSyncContext';
import { DurableSaveStatus } from './DurableSaveStatus';

// A quiet header status, including on phones. Network availability is a hint;
// only a resolved write is treated as a server acknowledgement.
export const SaveStatus = () => {
  const ctx = useSaveStatusOptional();
  const store = useGameSyncOptional();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (store) return <DurableSaveStatus store={store} online={online} />;
  if (!ctx) return null;
  const { status, pendingEdits, lastSavedAt } = ctx;
  const label = !online ? 'Offline'
    : status === 'saving' ? 'Saving…'
      : status === 'error' ? 'Save failed'
        : pendingEdits > 0 ? 'Unsaved changes'
          : status === 'saved' ? 'Saved' : '';
  const warning = !online || status === 'error' || pendingEdits > 0;
  const cx = clsx(styles.root, warning && styles.warning);
  const title = !online ? 'Offline. Changes may not have reached the server.'
    : status === 'error' ? 'A change could not be saved. Check the notification and retry the edit.'
      : pendingEdits > 0 ? 'Local edits have not yet been saved.'
        : lastSavedAt !== null ? `Last saved at ${new Date(lastSavedAt).toLocaleTimeString()}` : undefined;

  return (
    <span className={cx} role="status" aria-live="polite" aria-atomic="true" title={title}>
      {label && <>
        {online && status === 'saving'
          ? <span className={styles.spinner} aria-hidden="true" />
          : <Icon name={warning ? 'warning' : 'check'} size="small" />}
        <Text as="span" size="xs" color={warning ? 'default' : 'muted'}>{label}</Text>
      </>}
    </span>
  );
};

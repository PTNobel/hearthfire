import { useId, useState, useSyncExternalStore } from 'react';
import { Button, Heading, Input, Modal, Text } from '@/components/ui';
import type { GameSync } from '@/lib/gameSync';
import { missingParent, pathLabel, readPath, type PathPart } from '@/lib/syncChanges';
import { isPlainObject } from '@/lib/typeGuards';
import { useSaveStatusOptional } from './SaveStatusContext';
import styles from './SaveStatus.module.css';

const displayValue = (value: unknown): string => {
  if (value === undefined) return '(empty or deleted)';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
};

const fieldLabel = (root: unknown, path: PathPart[]): string => {
  const last = path[path.length - 1];
  const field = path[0] === 'notes' ? 'Notes' : typeof last === 'string' ? last.replace(/([a-z])([A-Z])/g, '$1 $2') : 'Item';
  const entityIndex = path.reduce((found, part, index) => typeof part === 'string' ? found : index, -1);
  const entity = entityIndex < 0 ? undefined : readPath(root, path.slice(0, entityIndex + 1));
  const name = isPlainObject(entity) ? entity.name || entity.title : undefined;
  return (typeof name === 'string' ? name + ' · ' : '') + field.charAt(0).toUpperCase() + field.slice(1);
};

export const DurableSaveStatus = ({ store, online }: { store: GameSync; online: boolean }) => {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const fieldStatus = useSaveStatusOptional();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const headingId = useId();
  const { queue } = state;
  const hasDraft = !!(queue.sending || queue.pending.length || queue.conflict);
  const label = state.storageError ? 'Draft not saved'
    : state.localWrites > 0 ? 'Saving on this device…'
      : queue.conflict ? 'Needs review'
        : queue.error ? 'Sync failed'
          : state.error ? 'Updates unavailable'
          : !online ? hasDraft ? 'Saved on this device · Offline' : 'Offline'
            : state.syncing ? 'Syncing…'
              : hasDraft ? 'Saved on this device'
                : fieldStatus?.pendingEdits ? 'Unsaved changes'
                  : queue.lastSavedAt ? 'Saved' : '';
  const remote = store.getRemote();
  const conflict = queue.conflict;
  const deleted = conflict?.changes.some((change) => missingParent(remote, change.path));
  const resolve = async (keepMine: boolean) => {
    setResolving(true);
    try { await store.resolveConflict(keepMine, remote); setError(null); }
    catch { setError('Could not update this draft. Please retry.'); }
    finally { setResolving(false); }
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(store.getRecovery(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'hearthfire-unsynced-drafts.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  if (!label) return null;
  return <>
    <span className={styles.root} role="status" aria-live="polite" aria-atomic="true">
      {state.syncing && <span className={styles.spinner} aria-hidden="true" />}
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Save status: ${label}`}>{label}</Button>
    </span>
    <Modal open={open} onClose={() => setOpen(false)} aria-labelledby={headingId}>
      <Heading as="h2" size="sm" id={headingId}>{label}</Heading>
      <Text>{state.storageError || queue.error || state.error || (hasDraft ? 'Your changes are preserved here and awaiting server confirmation.'
        : fieldStatus?.pendingEdits ? 'An open form has changes that have not been submitted.' : 'The latest submitted changes have been confirmed by the server.')}</Text>
      {error && <p role="alert">{error}</p>}
      {conflict && <>
        <Text>Review both versions before applying your changes.</Text>
        {queue.pending.length > 0 && <Text>Your later edits are also preserved and will be checked next.</Text>}
        {conflict.changes.map((change, index) => <div className={styles.comparison} key={`${pathLabel(change.path)}-${index}`}>
          <Heading as="h3" size="sm">{fieldLabel(remote, change.path)}</Heading>
          <Input multiline readOnly rows={3} label="Shared version" value={displayValue(readPath(remote, change.path))} />
          <Input multiline readOnly rows={3} label="Your version" value={displayValue(change.after)} />
        </div>)}
        {(deleted || conflict.restore || conflict.deltas) && <Text>This draft affects a deleted item or a whole-game operation. Download it for recovery; it cannot be applied automatically.</Text>}
        <div className={styles.actions}>
          <Button variant="secondary" disabled={resolving} onClick={() => { void resolve(false); }}>Keep shared version</Button>
          <Button variant="primary" disabled={resolving || deleted || !!conflict.restore || !!conflict.deltas} onClick={() => { void resolve(true); }}>Apply my changes</Button>
        </div>
      </>}
      <div className={styles.actions}>
        {!conflict && (queue.error || state.storageError || hasDraft) && <Button variant="secondary" onClick={() => { void store.retry(); }}>Retry sync</Button>}
        {state.error && <Button variant="secondary" onClick={() => window.location.reload()}>Reload game</Button>}
        {(hasDraft || state.storageError) && <Button variant="secondary" onClick={download}>Download drafts</Button>}
        <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
      </div>
    </Modal>
  </>;
};

import { useState, useCallback, useId } from 'react';
import { Heading, Button, Modal, Input, Fieldset, Text } from '@/components/ui';
import { useFormDraft } from '@/hooks/useFormDraft';
import { TagInput } from '@/components/fields';
import type { DropdownGroup } from '@/components/ui';
import { randomNpcName } from '@/lib/npcNames';
import type { NpcRelationship } from '@/types';
import { NPC_TRAITS, EMPTY_FORM } from './npcData';
import type { NpcFormState, RelTarget } from './npcData';
import { RelationshipRepeater } from './RelationshipRepeater';
import styles from './NpcModal.module.css';

interface NpcModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (form: NpcFormState, original: NpcFormState, id: string) => Promise<void>;
  draftKey: string;
  initial?: NpcFormState;
  title: string;
  relationshipGroups: DropdownGroup<RelTarget>[];
}

export const NpcModal = ({ open, onClose, onSave, initial = EMPTY_FORM, title, relationshipGroups, draftKey }: NpcModalProps) => {
  const headingId = useId();
  const draft = useFormDraft(draftKey, initial, open);
  const { value: form, change: setForm } = draft;
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, name: e.target.value }));
  }, [setForm]);

  const handlePronounsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, pronouns: e.target.value }));
  }, [setForm]);

  const handleOccupationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, occupation: e.target.value }));
  }, [setForm]);

  const handleNotesChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, notes: e.target.value }));
  }, [setForm]);

  const handleTagChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, tag: e.target.value }));
  }, [setForm]);

  const handleTraitsChange = useCallback((traits: string[]) => {
    setForm((f) => ({ ...f, traits }));
  }, [setForm]);

  const handleRelationshipsChange = useCallback((relationships: NpcRelationship[]) => {
    setForm((f) => ({ ...f, relationships }));
  }, [setForm]);

  const handleRandomName = useCallback(() => {
    setForm((f) => ({ ...f, name: randomNpcName() }));
  }, [setForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || submitting) return;
    setSubmitting(true);
    try { await onSave(form, draft.base.current, draft.recordId.current); }
    catch { setSaveError('Could not save this NPC. Your form is still open.'); setSubmitting(false); return; }
    await draft.clear().catch(() => {});
    onClose();
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} aria-labelledby={headingId}>
      <Heading as="h2" size="sm" id={headingId}>{title}</Heading>
      {draft.recoveries.map((saved) => <div key={saved.key}>
        <Button variant="secondary" onClick={() => draft.restore(saved)}>Restore draft: {saved.value.value.name || 'Unnamed NPC'}</Button>
        <Button variant="ghost" onClick={() => { void draft.discard(saved.key); }}>Discard saved copy</Button>
      </div>)}
      {(draft.error || saveError) && <p role="alert">{draft.error || saveError}</p>}
      {draft.error && <Button variant="secondary" onClick={() => draft.change(form)}>Retry saving draft</Button>}
      <Text size="xs" color="muted">{draft.saving ? 'Saving draft on this device…' : 'Form drafts are kept on this device.'}</Text>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.nameRow}>
          <Input label="Name *" value={form.name} onChange={handleNameChange} autoFocus required />
          <Button variant="ghost" size="sm" type="button" icon="dice" onClick={handleRandomName} aria-label="Random name" className={styles.diceBtn} />
        </div>
        <Input label="Pronouns" value={form.pronouns} onChange={handlePronounsChange} placeholder="e.g. she/her" />
        <Input label="Occupation" value={form.occupation} onChange={handleOccupationChange} placeholder="e.g. farmer, smith, midwife" />
        <Input label="Tag" value={form.tag ?? ''} onChange={handleTagChange} placeholder="Individual Tag (separate from traits)" />
        <TagInput
          label="Traits"
          value={form.traits}
          onChange={handleTraitsChange}
          suggestions={NPC_TRAITS}
          placeholder="Type or pick a trait…"
        />
        <Fieldset legend="Relationships" className={styles.relFieldset}>
          <RelationshipRepeater
            relationships={form.relationships}
            groups={relationshipGroups}
            onChange={handleRelationshipsChange}
          />
        </Fieldset>
        <Input
          multiline
          label="Notes"
          value={form.notes}
          onChange={handleNotesChange}
          rows={3}
          placeholder="Other notes about this NPC"
        />
        <div className={styles.formActions}>
          <Button variant="ghost" size="md" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" type="submit" disabled={!form.name.trim() || submitting || draft.saving}>Save NPC</Button>
        </div>
      </form>
    </Modal>
  );
};

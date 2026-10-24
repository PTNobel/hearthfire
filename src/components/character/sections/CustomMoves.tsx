import { useCallback, useState } from 'react';
import { useCharacterField } from '@/hooks/useCharacterField';
import { Button, Collapse, Heading, Input, Modal, Stack, Text } from '@/components/ui';
import { generateId } from '@/lib/id';
import { Move } from '../Move';
import type { CharacterData } from '@/types';
import styles from './Moves.module.css';

interface CustomMovesProps {
  data: CharacterData | undefined;
  onSave: (data: Partial<CharacterData>) => Promise<void>;
}

export const CustomMoves = ({ data, onSave }: CustomMovesProps) => {
  const { value: moves, save } = useCharacterField('customMoves', data?.customMoves ?? [], onSave, 'Failed to save custom move.');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  // Move awaiting delete confirmation; null while the modal is closed.
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null);

  const trimmedName = name.trim();
  const trimmedText = text.trim();
  const canAdd = trimmedName !== '' && trimmedText !== '';

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;
    save((current) => [...current, { id: generateId(), name: trimmedName, text: trimmedText }]);
    setName('');
    setText('');
  }, [canAdd, save, trimmedName, trimmedText]);

  const handleCancelRemove = useCallback(() => setPendingRemove(null), []);

  const handleConfirmRemove = useCallback(() => {
    if (!pendingRemove) return;
    save((current) => current.filter((m) => m.id !== pendingRemove.id));
    setPendingRemove(null);
  }, [pendingRemove, save]);

  return (
    <Collapse label="Custom Moves">
      <Text color="muted" className={styles.helperText}>
        These moves apply only to specific game or setting elements, and only if you choose to use them. Consult your GM.
      </Text>
      {moves.length > 0 ? (
        <div className={styles.moveGrid}>
          {moves.map((m) => (
            <Move
              key={m.id}
              title={m.name}
              // Each non-empty line of the textarea becomes its own paragraph; a para block renders as one run.
              move={{ id: m.id, name: m.name, body: m.text.split('\n').filter((line) => line.trim() !== '').map((line) => ({ kind: 'para' as const, text: line })) }}
              headerAction={
                <Button variant="ghost" size="sm" icon="trash" aria-label={`Remove ${m.name}`} onClick={() => setPendingRemove({ id: m.id, name: m.name })} />
              }
            />
          ))}
        </div>
      ) : (
        <Text color="muted">No custom moves yet.</Text>
      )}
      <form onSubmit={handleSubmit} className={styles.customForm}>
        <Stack gap={3}>
          <Input label="Move name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Move text"
            note="Bold and italic only"
            multiline
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" disabled={!canAdd}>Add move</Button>
        </Stack>
      </form>
      <Modal open={pendingRemove !== null} onClose={handleCancelRemove} aria-labelledby="remove-custom-move-title">
        <Stack gap={4}>
          <Heading as="h3" size="md" id="remove-custom-move-title">Remove {pendingRemove?.name}?</Heading>
          <Text color="muted">This deletes the move from your sheet.</Text>
          <Stack gap={2}>
            <Button variant="danger" onClick={handleConfirmRemove}>Remove move</Button>
            <Button variant="secondary" onClick={handleCancelRemove}>Cancel</Button>
          </Stack>
        </Stack>
      </Modal>
    </Collapse>
  );
};

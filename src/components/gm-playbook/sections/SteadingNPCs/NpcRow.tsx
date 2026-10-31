import { useCallback } from 'react';
import clsx from 'clsx';
import { Button, Text, Tooltip } from '@/components/ui';
import type { SteadingNPC, NpcRelationship } from '@/types';
import styles from './NpcRow.module.css';

export interface IncomingRelationship {
  source: SteadingNPC;
  relationship: NpcRelationship;
}

interface NpcRowProps {
  npc: SteadingNPC;
  onEdit: (npc: SteadingNPC) => void;
  onRemove: (id: string) => void;
  onToggleDead: (id: string) => void;
  resolveTarget: (rel: NpcRelationship) => string;
  incomingRelationships: IncomingRelationship[];
}

// Keep the original direction visible on either card. Free-form labels such as
// "mother" or "distrusts" cannot safely be inverted into a reciprocal label.
const relationshipLabel = (source: string, rel: NpcRelationship, target: string): string =>
  [rel.targetId ? `${source} → ${target}` : '', rel.type].filter(Boolean).join(': ');

export const NpcRow = ({ npc, onEdit, onRemove, onToggleDead, resolveTarget, incomingRelationships }: NpcRowProps) => {
  const handleEdit = useCallback(() => onEdit(npc), [onEdit, npc]);
  const handleRemove = useCallback(() => onRemove(npc.id), [onRemove, npc.id]);
  const handleToggleDead = useCallback(() => onToggleDead(npc.id), [onToggleDead, npc.id]);
  const rowCx = clsx(styles.npcRow, npc.dead && styles.npcRowDead);
  const nameCx = clsx(npc.dead && styles.npcNameStrike);
  const tombstoneCx = clsx(npc.dead && styles.tombstoneActive);
  const relationships = [
    ...(npc.relationships ?? []).map((rel) => ({
      key: `outgoing:${rel.id}`, label: relationshipLabel(npc.name, rel, resolveTarget(rel)),
    })),
    ...incomingRelationships.map(({ source, relationship }) => ({
      key: `incoming:${source.id}:${relationship.id}`, label: relationshipLabel(source.name, relationship, npc.name),
    })),
  ].filter(({ label }) => label);
  return (
    <div className={rowCx} role="listitem">
      <div className={styles.npcInfo}>
        <Text as="span" className={styles.npcName}>
          <span className={nameCx}>{npc.name}</span>
          {npc.dead && <Text as="span" className={styles.npcDeadLabel}>(DEAD)</Text>}
          {npc.pronouns && <span className={styles.npcPronouns}>{npc.pronouns}</span>}
        </Text>
        {npc.occupation && <Text as="span" size="xs" color="muted" italic>{npc.occupation}</Text>}
        {npc.traits && npc.traits.length > 0 && (
          <div className={styles.npcTraits}>
            {npc.traits.map((t) => (
              <span key={t} className={styles.npcTrait}>{t}</span>
            ))}
          </div>
        )}
        {relationships.length > 0 && (
          <div className={styles.npcRelTraits}>
            {relationships.map(({ key, label }) => <span key={key} className={styles.npcRelTrait}>{label}</span>)}
          </div>
        )}
        {npc.notes && <Text as="span" size="xs" color="muted">{npc.notes}</Text>}
      </div>
      <div className={styles.npcActions}>
        <Button variant="ghost" size="sm" onClick={handleEdit} aria-label={`Edit ${npc.name}`}>Edit</Button>
        <Tooltip text={npc.dead ? 'Mark as alive' : 'Mark as dead'} noTabStop>
          <Button
            variant="ghost"
            size="sm"
            icon="tombstone"
            onClick={handleToggleDead}
            aria-label={npc.dead ? `Mark ${npc.name} as alive` : `Mark ${npc.name} as dead`}
            className={tombstoneCx}
          />
        </Tooltip>
        <Tooltip text="Remove NPC" noTabStop>
          <Button variant="ghost" size="sm" icon="trash" onClick={handleRemove} aria-label={`Remove ${npc.name}`} />
        </Tooltip>
      </div>
    </div>
  );
};

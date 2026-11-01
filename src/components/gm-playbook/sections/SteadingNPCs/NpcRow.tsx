import { useCallback } from 'react';
import clsx from 'clsx';
import { Button, Tooltip } from '@/components/ui';
import type { SteadingNPC, NpcRelationship } from '@/types';
import { NpcDetails } from './NpcDetails';
import type { IncomingRelationship } from './npcRelationships';
import styles from './NpcRow.module.css';

interface NpcRowProps {
  npc: SteadingNPC;
  onEdit: (npc: SteadingNPC) => void;
  onRemove: (id: string) => void;
  onToggleDead: (id: string) => void;
  resolveTarget: (rel: NpcRelationship) => string;
  incomingRelationships: IncomingRelationship[];
}

export const NpcRow = ({ npc, onEdit, onRemove, onToggleDead, resolveTarget, incomingRelationships }: NpcRowProps) => {
  const handleEdit = useCallback(() => onEdit(npc), [onEdit, npc]);
  const handleRemove = useCallback(() => onRemove(npc.id), [onRemove, npc.id]);
  const handleToggleDead = useCallback(() => onToggleDead(npc.id), [onToggleDead, npc.id]);
  const rowCx = clsx(styles.npcRow, npc.dead && styles.npcRowDead);
  const tombstoneCx = clsx(npc.dead && styles.tombstoneActive);
  return (
    <div className={rowCx} role="listitem">
      <div className={styles.npcInfo}>
        <NpcDetails npc={npc} resolveTarget={resolveTarget} incomingRelationships={incomingRelationships} />
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

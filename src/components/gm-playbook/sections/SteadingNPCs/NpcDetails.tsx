import clsx from 'clsx';
import { Text } from '@/components/ui';
import type { SteadingNPC, NpcRelationship } from '@/types';
import type { IncomingRelationship } from './npcRelationships';
import styles from './NpcRow.module.css';

interface NpcDetailsProps {
  npc: SteadingNPC;
  resolveTarget: (rel: NpcRelationship) => string;
  incomingRelationships: IncomingRelationship[];
}

// Free-form labels such as "mother" or "distrusts" cannot safely be inverted.
const relationshipLabel = (source: string, rel: NpcRelationship, target: string): string =>
  [rel.targetId ? `${source} → ${target}` : '', rel.type].filter(Boolean).join(': ');

export const NpcDetails = ({ npc, resolveTarget, incomingRelationships }: NpcDetailsProps) => {
  const nameCx = clsx(npc.dead && styles.npcNameStrike);
  const relationships = [
    ...(npc.relationships ?? []).map((rel) => ({
      key: `outgoing:${rel.id}`, label: relationshipLabel(npc.name, rel, resolveTarget(rel)),
    })),
    ...incomingRelationships.map(({ source, relationship }) => ({
      key: `incoming:${source.id}:${relationship.id}`, label: relationshipLabel(source.name, relationship, npc.name),
    })),
  ].filter(({ label }) => label);
  return <div className={styles.npcDetails} role="group" aria-label="NPC profile">
    <Text as="span" className={styles.npcName}>
      <span className={nameCx}>{npc.name}</span>
      {npc.dead && <Text as="span" className={styles.npcDeadLabel}>(DEAD)</Text>}
      {npc.pronouns && <span className={styles.npcPronouns}>{npc.pronouns}</span>}
    </Text>
    {npc.occupation && <Text as="span" size="xs" color="muted" italic>{npc.occupation}</Text>}
    {npc.tag && <Text as="span" size="xs">Tag: {npc.tag}</Text>}
    {!!npc.traits?.length && <div className={styles.npcTraits}>
      {npc.traits.map((trait) => <span key={trait} className={styles.npcTrait}>{trait}</span>)}
    </div>}
    {relationships.length > 0 && <div className={styles.npcRelTraits}>
      {relationships.map(({ key, label }) => <span key={key} className={styles.npcRelTrait}>{label}</span>)}
    </div>}
    {npc.notes && <Text as="span" size="xs" color="muted">{npc.notes}</Text>}
  </div>;
};

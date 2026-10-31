import { useState, useRef, useCallback, useMemo } from 'react';
import { Text, Button } from '@/components/ui';
import type { DropdownGroup } from '@/components/ui';
import { useOptimisticField } from '@/hooks/useOptimisticField';
import type { SteadingData, SteadingNPC, NpcRelationship, GameSession } from '@/types';
import { NPC_CONFIG, buildGroups, buildNameMap } from './npcData';
import type { NpcFormState, RelTarget } from './npcData';
import { NpcModal } from './NpcModal';
import { NpcRow, type IncomingRelationship } from './NpcRow';
import styles from './SteadingNPCs.module.css';

const excludeFromGroups = (groups: DropdownGroup<RelTarget>[], excludeId: string): DropdownGroup<RelTarget>[] =>
  groups
    .map((g) => ({ ...g, options: g.options.filter((o) => !o.value.endsWith(`::${excludeId}`) ) }))
    .filter((g) => g.options.length > 0);

interface NpcSectionProps {
  title: string;
  description: string;
  npcs: SteadingNPC[];
  onUpdate: (transform: (current: SteadingNPC[]) => SteadingNPC[], removedId?: string, original?: SteadingNPC) => Promise<void>;
  onToggleDead: (id: string) => void;
  relationshipGroups: DropdownGroup<RelTarget>[];
  resolveTarget: (rel: NpcRelationship) => string;
  incomingRelationships: Map<string, IncomingRelationship[]>;
}

const npcToForm = (npc: SteadingNPC): NpcFormState => ({
  name: npc.name,
  pronouns: npc.pronouns ?? '',
  occupation: npc.occupation ?? '',
  traits: npc.traits ?? [],
  relationships: npc.relationships ?? [],
  notes: npc.notes ?? '',
});

const NpcSection = ({ title, description, npcs, onUpdate, onToggleDead, relationshipGroups, resolveTarget, incomingRelationships }: NpcSectionProps) => {
  const [addOpen, setAddOpen] = useState(false);
  const [editNpc, setEditNpc] = useState<SteadingNPC | null>(null);

  const openAdd = useCallback(() => setAddOpen(true), []);
  const closeAdd = useCallback(() => setAddOpen(false), []);
  const closeEdit = useCallback(() => setEditNpc(null), []);

  const handleAdd = useCallback((form: NpcFormState, _original: NpcFormState, id: string) => {
    const npc = { id, ...form };
    return onUpdate((current) => current.some((item) => item.id === id) ? current.map((item) => item.id === id ? npc : item) : [...current, npc]);
  }, [onUpdate]);

  const handleEdit = useCallback((npc: SteadingNPC) => {
    setEditNpc(npc);
  }, []);

  const handleSaveEdit = useCallback((form: NpcFormState, original: NpcFormState) => {
    if (!editNpc) return Promise.reject(new Error("NPC is no longer open."));
    return onUpdate((current) => current.some((n) => n.id === editNpc.id)
      ? current.map((n) => n.id === editNpc.id ? { ...n, ...form } : n)
      : [...current, { ...editNpc, ...form }], undefined, { ...editNpc, ...original });
  }, [onUpdate, editNpc]);

  const handleRemove = useCallback((id: string) => {
    onUpdate((current) => current.filter((n) => n.id !== id), id);
  }, [onUpdate]);

  return (
    <div className={styles.section}>
      <div className={styles.addRow}>
        <Text size="xs" color="muted">{description}</Text>
        <Button variant="secondary" size="sm" onClick={openAdd}>Add NPC</Button>
      </div>

      {npcs.length > 0 && (
        <div className={styles.npcList} role="list" aria-label={`${title} list`}>
          {npcs.map((npc) => (
            <NpcRow
              key={npc.id}
              npc={npc}
              onEdit={handleEdit}
              onRemove={handleRemove}
              onToggleDead={onToggleDead}
              resolveTarget={resolveTarget}
              incomingRelationships={incomingRelationships.get(npc.id) ?? []}
            />
          ))}
        </div>
      )}

      <NpcModal
        key={addOpen ? 'add-open' : 'add-closed'}
        open={addOpen}
        onClose={closeAdd}
        onSave={handleAdd}
        draftKey={`npc-${title}-new`}
        title={`Add NPC — ${title}`}
        relationshipGroups={relationshipGroups}
      />
      <NpcModal
        key={editNpc?.id ?? 'edit'}
        open={editNpc !== null}
        onClose={closeEdit}
        onSave={handleSaveEdit}
        initial={editNpc ? npcToForm(editNpc) : undefined}
        draftKey={`npc-${editNpc?.id ?? "edit"}`}
        title="Edit NPC"
        relationshipGroups={editNpc ? excludeFromGroups(relationshipGroups, editNpc.id) : relationshipGroups}
      />
    </div>
  );
};

interface SteadingNPCsProps {
  section: keyof typeof NPC_CONFIG;
  npcs: SteadingNPC[] | undefined;
  onSave: (patch: Partial<SteadingData>, base?: Partial<SteadingData>) => Promise<void>;
  game: GameSession;
  filterTargetId?: string;
}

// section -> the SteadingData sentinel field updateSteading reads to distinguish
// intentional removal from an id merely absent from a stale local snapshot.
const REMOVED_IDS_FIELD = {
  residents: 'removedResidentIds',
  neighbors: 'removedNeighborIds',
} as const satisfies Record<keyof typeof NPC_CONFIG, keyof SteadingData>;

export const SteadingNPCs = ({ section, npcs = [], onSave, game, filterTargetId }: SteadingNPCsProps) => {
  const { title, description } = NPC_CONFIG[section];
  const npcBase = useRef<SteadingNPC[]>(npcs);
  const { value: localNpcs, save: saveNpcs } = useOptimisticField<SteadingNPC[], [removedId?: string, original?: SteadingNPC]>(
    npcs,
    (next, removedId, original): Promise<void> => onSave({
      [section]: next,
      ...(removedId ? { [REMOVED_IDS_FIELD[section]]: [removedId] } : {}),
    }, { [section]: original
      ? npcBase.current.some((npc) => npc.id === original.id)
        ? npcBase.current.map((npc) => npc.id === original.id ? original : npc)
        : [...npcBase.current, original]
      : npcBase.current }),
    undefined, undefined, npcBase,
  );

  const handleToggleDead = useCallback((id: string) => {
    saveNpcs((current) => current.map((n) => n.id === id ? { ...n, dead: !n.dead } : n));
  }, [saveNpcs]);
  const incomingRelationships = useMemo(() => {
    const incoming = new Map<string, IncomingRelationship[]>();
    const targetKind = section === 'residents' ? 'resident' : 'neighbor';
    const sources = [
      ['resident', section === 'residents' ? localNpcs : game.steading?.residents ?? []],
      ['neighbor', section === 'neighbors' ? localNpcs : game.steading?.neighbors ?? []],
    ] as const;
    // Derive incoming links from their single stored source. Include optimistic
    // local edits so a removed source disappears before the next game snapshot.
    for (const [sourceKind, npcs] of sources) {
      for (const source of npcs) {
        for (const relationship of source.relationships ?? []) {
          if (!relationship.targetId || relationship.targetKind !== targetKind
            || (sourceKind === targetKind && source.id === relationship.targetId)) continue;
          const entries = incoming.get(relationship.targetId) ?? [];
          entries.push({ source, relationship });
          incoming.set(relationship.targetId, entries);
        }
      }
    }
    return incoming;
  }, [section, localNpcs, game.steading?.residents, game.steading?.neighbors]);
  const visibleNpcs = useMemo(() => {
    const list = filterTargetId
      ? localNpcs.filter((n) => (n.relationships ?? []).some((r) => r.targetId === filterTargetId)
        || incomingRelationships.get(n.id)?.some(({ source }) => source.id === filterTargetId))
      : localNpcs;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [localNpcs, filterTargetId, incomingRelationships]);
  const groups = useMemo(
    () => buildGroups(game),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.characters, game.steading?.residents, game.steading?.neighbors],
  );
  const nameMap = useMemo(
    () => {
      const names = buildNameMap(game);
      for (const npc of localNpcs) names.set(npc.id, npc.name);
      return names;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.characters, game.steading?.residents, game.steading?.neighbors, localNpcs],
  );
  const resolveTarget = useCallback(
    (rel: NpcRelationship) => nameMap.get(rel.targetId) ?? rel.targetId,
    [nameMap],
  );

  return (
    <NpcSection
      title={title}
      description={description}
      npcs={visibleNpcs}
      onUpdate={saveNpcs}
      onToggleDead={handleToggleDead}
      relationshipGroups={groups}
      resolveTarget={resolveTarget}
      incomingRelationships={incomingRelationships}
    />
  );
};

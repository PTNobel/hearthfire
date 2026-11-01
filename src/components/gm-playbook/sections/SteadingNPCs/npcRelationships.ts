import type { NpcRelationship, SteadingNPC } from '@/types';
import { encodeTarget, type RelTarget } from './npcData';

export interface IncomingRelationship {
  source: SteadingNPC;
  relationship: NpcRelationship;
}

export const buildIncomingRelationships = (
  residents: SteadingNPC[] = [], neighbors: SteadingNPC[] = [],
): Map<RelTarget, IncomingRelationship[]> => {
  const incoming = new Map<RelTarget, IncomingRelationship[]>();
  for (const [kind, npcs] of [['resident', residents], ['neighbor', neighbors]] as const) {
    for (const source of npcs) {
      for (const relationship of source.relationships ?? []) {
        const target = encodeTarget(relationship);
        if (!target || target === `${kind}::${source.id}`) continue;
        const entries = incoming.get(target) ?? [];
        entries.push({ source, relationship });
        incoming.set(target, entries);
      }
    }
  }
  return incoming;
};

import type { GameSession, SteadingNPC } from '@/types';
import type { GraphData, GraphEdge } from './relationshipGraphData';

export interface RelationshipHoverDetails {
  title: string;
  category: string;
  facts: string[];
  connections: string[];
}

const describeEdge = (graph: GraphData, edge: GraphEdge): string => {
  const source = graph.nodes.find((n) => n.id === edge.sourceId);
  const target = graph.nodes.find((n) => n.id === edge.targetId);
  return `${source?.label ?? edge.sourceId} → ${target?.label ?? edge.targetId}: ${edge.type || 'related'}`;
};

export const edgeHoverDetails = (graph: GraphData, edgeId: string): RelationshipHoverDetails | null => {
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  return {
    title: 'Relationship',
    category: describeEdge(graph, edge),
    facts: [],
    connections: [],
  };
};

export const nodeHoverDetails = (
  game: GameSession,
  graph: GraphData,
  nodeId: string,
): RelationshipHoverDetails | null => {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const npc: SteadingNPC | undefined = node.kind === 'resident'
    ? game.steading?.residents?.find((n) => n.id === nodeId)
    : node.kind === 'neighbor'
      ? game.steading?.neighbors?.find((n) => n.id === nodeId)
      : undefined;
  const crewOwner = game.characters.find((c) => c.playbook === 'marshal'
    && Object.values(c.data?.playbookFeatures?.crewNpcLinks ?? {}).includes(nodeId));
  const facts = [
    npc?.pronouns || '',
    npc?.occupation || '',
    npc?.tag ? `Tag: ${npc.tag}` : '',
    node.dead ? 'Deceased' : '',
    crewOwner ? `Marshal's Crew (${crewOwner.name || 'Marshal'})` : '',
    ...(npc?.traits ?? []),
    npc?.notes?.trim() || '',
  ].filter(Boolean);
  const connections = graph.edges
    .filter((e) => e.sourceId === nodeId || e.targetId === nodeId)
    .map((edge) => describeEdge(graph, edge));
  return {
    title: node.label,
    category: node.kind === 'pc' ? 'Player character'
      : node.kind === 'resident' ? 'Stonetop resident' : 'Notable neighbor',
    facts,
    connections,
  };
};

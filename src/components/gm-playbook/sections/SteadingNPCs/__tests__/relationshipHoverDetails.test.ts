import { describe, expect, it } from 'vitest';
import type { GameSession } from '@/types';
import { edgeHoverDetails, nodeHoverDetails } from '../relationshipHoverDetails';
import { buildRelationshipGraph } from '../relationshipGraphData';

const game: GameSession = {
  id: 'test', createdAt: 0, name: 'Test',
  characters: [{ id: 'marshal', playbook: 'marshal', name: 'Ada', level: 1, data: {
    playbookFeatures: { crewNpcLinks: { '0': 'guard' } },
  } }],
  steading: { residents: [
    {
      id: 'guard', name: 'Ffion', occupation: 'Soldier', tag: 'rookie', traits: ['fearless'],
      relationships: [{ id: 'rel-a', type: 'friend', targetKind: 'resident', targetId: 'healer' }],
    },
    {
      id: 'healer', name: 'Eira', occupation: 'Healer',
      relationships: [{ id: 'rel-b', type: 'sibling', targetKind: 'pc', targetId: 'marshal' }],
    },
  ] },
};

describe('relationship hover details', () => {
  it('displays the single Steading NPC identity including linked Marshal crew membership', () => {
    const graph = buildRelationshipGraph(game, 960, 600);
    expect(nodeHoverDetails(game, graph, 'guard')).toMatchObject({
      title: 'Ffion', category: 'Stonetop resident',
      facts: expect.arrayContaining(['Soldier', 'Tag: rookie', 'fearless', "Marshal's Crew (Ada)"]),
      connections: ['Ffion → Eira: friend'],
    });
  });

  it('includes edges incoming to player characters and describes directed relationships', () => {
    const graph = buildRelationshipGraph(game, 960, 600);
    const pc = nodeHoverDetails(game, graph, 'marshal');
    expect(pc?.category).toBe('Player character');
    expect(pc?.connections).toContain('Eira → Ada (The Marshal): sibling');
    expect(edgeHoverDetails(graph, 'rel-a')?.category).toBe('Ffion → Eira: friend');
  });

  it('keeps Tag separate from equal trait text and omits absent or cleared Tags', () => {
    const residents = game.steading!.residents!;
    const tagged = { ...game, steading: { residents: [
      { ...residents[0], tag: 'fearless' }, residents[1],
    ] } };
    const graph = buildRelationshipGraph(tagged, 960, 600);
    expect(nodeHoverDetails(tagged, graph, 'guard')?.facts)
      .toEqual(expect.arrayContaining(['Tag: fearless', 'fearless']));
    expect(nodeHoverDetails(tagged, graph, 'healer')?.facts.some((fact) => fact.startsWith('Tag:'))).toBe(false);
    const cleared = { ...tagged, steading: { residents: [
      { ...tagged.steading.residents[0], tag: '' }, residents[1],
    ] } };
    const facts = nodeHoverDetails(cleared, graph, 'guard')?.facts;
    expect(facts).toContain('fearless');
    expect(facts?.some((fact) => fact.startsWith('Tag:'))).toBe(false);
  });

  it('ignores disconnected/missing nodes without fabricating facts', () => {
    const graph = buildRelationshipGraph(game, 960, 600);
    expect(nodeHoverDetails(game, graph, 'absent')).toBeNull();
    expect(edgeHoverDetails(graph, 'absent')).toBeNull();
  });
});

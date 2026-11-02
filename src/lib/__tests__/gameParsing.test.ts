import { describe, it, expect } from 'vitest';
import { parseDiceRolls, parseSteading } from '../gameParsing';

const base = {
  id: 'r1',
  characterId: 'gm',
  characterName: 'GM',
  moveName: '',
  stat: 'nothing',
  dice: [],
  mod: 0,
  total: 9,
  mode: 'normal',
  band: null,
  createdAt: 1,
};

describe('parseDiceRolls', () => {
  it('keeps notation and breakdown on free-form rolls', () => {
    const [roll] = parseDiceRolls([{ ...base, notation: '2d6+1', breakdown: '[4, 4] + 1' }]) ?? [];
    expect(roll.notation).toBe('2d6+1');
    expect(roll.breakdown).toBe('[4, 4] + 1');
  });

  it('leaves them off legacy move rolls', () => {
    const [roll] = parseDiceRolls([base]) ?? [];
    expect(roll).not.toHaveProperty('notation');
    expect(roll).not.toHaveProperty('breakdown');
  });
});


describe('NPC individual Tags', () => {
  it('parses Tags independently of traits and notes, including a deliberately cleared Tag', () => {
    const residents = parseSteading({ residents: [
      { id: 'a', name: 'Alda', tag: 'rookie', traits: ['bald'], notes: 'Green cloak.' },
      { id: 'b', name: 'Bram', tag: '', traits: ['rookie'] },
      { id: 'c', name: 'Cora', tag: 123 },
      { id: 'd', name: 'Dara' },
    ] })?.residents;
    expect(residents?.[0]).toMatchObject({ tag: 'rookie', traits: ['bald'], notes: 'Green cloak.' });
    expect(residents?.[1]).toMatchObject({ tag: '', traits: ['rookie'] });
    expect(residents?.[2].tag).toBeUndefined();
    expect(residents?.[3].tag).toBeUndefined();
  });
});

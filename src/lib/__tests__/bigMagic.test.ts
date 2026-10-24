import { describe, expect, it } from 'vitest';
import { bigMagicCount } from '../bigMagic';
import type { CharacterData } from '@/types';

const data = (typeMoves: Record<string, boolean>, typeMoveTakes: Record<string, number> = {}) =>
  ({ typeMoves, typeMoveTakes }) as CharacterData;

describe('bigMagicCount', () => {
  it('is 0 when unselected', () => {
    expect(bigMagicCount(undefined)).toBe(0);
    expect(bigMagicCount(data({}, { 'blessed-big-magic': 3 }))).toBe(0);
  });
  it('counts the select box plus each take box', () => {
    expect(bigMagicCount(data({ 'blessed-big-magic': true }))).toBe(1);
    expect(bigMagicCount(data({ 'blessed-big-magic': true }, { 'blessed-big-magic': 0b11 }))).toBe(3);
  });
});

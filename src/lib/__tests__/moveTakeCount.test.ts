import { describe, expect, it } from 'vitest';
import { moveTakeCount } from '../moveTakeCount';
import type { CharacterData } from '@/types';

const data = (typeMoves: Record<string, boolean>, typeMoveTakes: Record<string, number> = {}) =>
  ({ typeMoves, typeMoveTakes }) as CharacterData;

describe('moveTakeCount', () => {
  it('is 0 when the move is not selected', () => {
    expect(moveTakeCount(undefined, 'm')).toBe(0);
    expect(moveTakeCount(data({}, { m: 1 }), 'm')).toBe(0);
  });
  it('counts the select box plus each checked take box', () => {
    expect(moveTakeCount(data({ m: true }), 'm')).toBe(1);
    expect(moveTakeCount(data({ m: true }, { m: 0b101 }), 'm')).toBe(3);
  });
});

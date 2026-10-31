import { describe, expect, it } from 'vitest';
import { applyChanges, composeChanges, diffValues, EditConflict } from '../syncChanges';

describe('edit intent', () => {
  const original = { npcs: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] };
  it('preserves independent edits from stale lists', () => {
    const first = diffValues(original, { npcs: [{ id: 'a', name: 'Edited A' }, original.npcs[1]] });
    const second = diffValues(original, { npcs: [original.npcs[0], { id: 'b', name: 'Edited B' }] });
    expect(applyChanges(applyChanges(original, first, true), second, true)).toEqual({ npcs: [{ id: 'a', name: 'Edited A' }, { id: 'b', name: 'Edited B' }] });
  });
  it('does not resurrect a deletion when a stale client edits another entry', () => {
    const removed = { npcs: [original.npcs[1]] };
    const edit = diffValues(original, { npcs: [original.npcs[0], { id: 'b', name: 'Edited B' }] });
    expect(applyChanges(removed, edit, true)).toEqual({ npcs: [{ id: 'b', name: 'Edited B' }] });
  });
  it('conflicts on editing a deleted entity, including a previously absent field', () => {
    const edit = diffValues(original, { npcs: [{ ...original.npcs[0], notes: 'draft' }, original.npcs[1]] });
    expect(() => applyChanges({ npcs: [original.npcs[1]] }, edit, true)).toThrow(EditConflict);
  });
  it('rejects competing edits and deletion of an edited entity', () => {
    const changed = { npcs: [{ id: 'a', name: 'Other edit' }, original.npcs[1]] };
    expect(() => applyChanges(changed, diffValues(original, { npcs: [original.npcs[1]] }), true)).toThrow(EditConflict);
  });
  it('coalesces repeated unsent typing without losing its original baseline', () => {
    const changes = composeChanges(diffValues({ text: 'A' }, { text: 'B' }), diffValues({ text: 'B' }, { text: 'C' }));
    expect(changes).toEqual([{ path: ['text'], before: 'A', after: 'C' }]);
    expect(applyChanges({ text: 'A' }, changes, true)).toEqual({ text: 'C' });
  });
  it('merges independent leaves of a previously absent object', () => {
    const first = diffValues({}, { data: { a: 1 } });
    const second = diffValues({}, { data: { b: 2 } });
    expect(applyChanges(applyChanges({}, first, true), second, true)).toEqual({ data: { a: 1, b: 2 } });
  });
  it('merges independent entities into a previously absent list', () => {
    const first = diffValues({}, { npcs: [{ id: 'a', name: 'A' }] });
    const second = diffValues({}, { npcs: [{ id: 'b', name: 'B' }] });
    expect(applyChanges(applyChanges({}, first, true), second, true)).toEqual(original);
  });
  it('accepts a convergent assignment without a false conflict', () => {
    const changes = diffValues({ text: 'old' }, { text: 'latest' });
    expect(applyChanges({ text: 'latest' }, changes, true)).toEqual({ text: 'latest' });
  });
});

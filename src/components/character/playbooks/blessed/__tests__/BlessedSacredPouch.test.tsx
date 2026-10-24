import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { toastModuleMock } from '@/test/toastMock';
import type { CharacterData } from '@/types';

vi.mock('@/components/app', () => toastModuleMock());

import { BlessedSacredPouch } from '../BlessedSacredPouch';

afterEach(() => { vi.clearAllMocks(); });

const TRAIT_BOXES = () =>
  screen.getAllByRole('checkbox') as HTMLInputElement[];

// Big Magic: the select box is the first take; take boxes are a bitmask.
const withBigMagic = (takes = 0): CharacterData =>
  ({ typeMoves: { 'blessed-big-magic': true }, typeMoveTakes: { 'blessed-big-magic': takes } }) as CharacterData;

describe('BlessedSacredPouch traits', () => {
  it('allows one trait without Big Magic and disables the rest once picked', () => {
    render(<BlessedSacredPouch data={undefined} onSave={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.getByText(/choose 1\)/)).toBeTruthy();

    const boxes = TRAIT_BOXES();
    fireEvent.click(boxes[0]);
    expect(boxes[0].checked).toBe(true);
    expect(boxes.slice(1).every((b) => b.disabled)).toBe(true);
  });

  it('allows a second trait for each Big Magic take', () => {
    render(<BlessedSacredPouch data={withBigMagic()} onSave={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.getByText(/choose 2\)/)).toBeTruthy();

    const boxes = TRAIT_BOXES();
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    expect(boxes[0].checked && boxes[1].checked).toBe(true);
    expect(boxes[2].disabled).toBe(true);
  });

  it('counts take boxes toward the picks', () => {
    // 1 base + select box + 2 take boxes.
    render(<BlessedSacredPouch data={withBigMagic(0b11)} onSave={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.getByText(/choose 4\)/)).toBeTruthy();
  });

  it('migrates a legacy single-string trait to a checked box', () => {
    const legacy = {
      playbookFeatures: { sacredPouchTrait: 'It cannot be cut, torn, or burned by any natural means.' },
    } as CharacterData;
    render(<BlessedSacredPouch data={legacy} onSave={vi.fn().mockResolvedValue(undefined)} />);
    const boxes = TRAIT_BOXES();
    expect(boxes[0].checked).toBe(true);
    expect(boxes.slice(1).every((b) => !b.checked)).toBe(true);
  });

  it('saves picks to sacredPouchTraits', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<BlessedSacredPouch data={undefined} onSave={onSave} />);
    fireEvent.click(TRAIT_BOXES()[0]);
    const patch = onSave.mock.calls[0][0] as CharacterData;
    expect(Object.values(patch.playbookFeatures?.sacredPouchTraits ?? {})).toEqual([true]);
  });
});

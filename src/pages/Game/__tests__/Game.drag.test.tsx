import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderRoute } from '@/test/renderWithProviders';

const reorderCharacters = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const game = vi.hoisted(() => ({
  id: 'test-session',
  name: 'The Test Game',
  createdAt: 0,
  characters: [
    { id: 'a', name: 'Ash', playbook: 'heavy', level: 1 },
    { id: 'b', name: 'Bram', playbook: 'fox', level: 1 },
  ],
}));

vi.mock('@/lib/sessionGame', () => ({
  requireSessionGameId: () => 'test-session',
}));
vi.mock('@/hooks/useGame', () => ({
  useGame: () => ({
    game, loading: false, error: null,
    updateGameName: vi.fn().mockResolvedValue(undefined),
    addCharacter: vi.fn().mockResolvedValue(undefined),
    removeCharacter: vi.fn().mockResolvedValue(undefined),
    reorderCharacters,
    replaceGameData: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { Game } from '../Game';

const roster = () => screen.getAllByRole('listitem', { name: /drag to reorder/i });
const rosterNames = () => roster().map((row) => row.getAttribute('aria-label')?.split(' — ')[0]);

describe('drag reordering', () => {
  beforeEach(() => reorderCharacters.mockClear());

  it('restores the original order when a drag is cancelled', () => {
    renderRoute(<Game />, '/game', '/game');
    const [ash, bram] = roster();
    fireEvent.dragStart(ash, { dataTransfer: { effectAllowed: 'move' } });
    fireEvent.dragOver(bram, { clientY: window.innerHeight / 2 });
    expect(rosterNames()).toEqual(['Bram', 'Ash']);

    // A drag ending without a drop (Escape, or release outside the roster).
    fireEvent.dragEnd(ash);
    expect(rosterNames()).toEqual(['Ash', 'Bram']);
    expect(reorderCharacters).not.toHaveBeenCalled();
  });

  it('persists the preview order after a drop on a character row', () => {
    renderRoute(<Game />, '/game', '/game');
    const [ash, bram] = roster();
    fireEvent.dragStart(ash, { dataTransfer: { effectAllowed: 'move' } });
    fireEvent.dragOver(bram, { clientY: window.innerHeight / 2 });
    fireEvent.drop(bram);
    fireEvent.dragEnd(ash);

    expect(rosterNames()).toEqual(['Bram', 'Ash']);
    expect(reorderCharacters).toHaveBeenCalledTimes(1);
    expect(reorderCharacters.mock.calls[0][0].map((c: { id: string }) => c.id)).toEqual(['b', 'a']);
  });

  it('does not save when dragend occurs without a drag', () => {
    renderRoute(<Game />, '/game', '/game');
    fireEvent.dragEnd(roster()[0]);
    expect(reorderCharacters).not.toHaveBeenCalled();
  });
});

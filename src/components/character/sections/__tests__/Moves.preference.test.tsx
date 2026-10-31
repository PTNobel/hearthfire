import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/app/Toast/Toast';
import { Moves } from '../Moves';
import { selectedMovesPreferenceKey } from '@/lib/selectedMovesPreference';

vi.mock('@/hooks/usePlaybookMoves', () => ({
  usePlaybookMoves: () => [
    { id: 'always-move', name: 'Always Granted Move', startingMove: true, leftControl: 1 },
    { id: 'picked-move', name: 'Chosen Test Move', leftControl: 1 },
    { id: 'other-move', name: 'Unchosen Test Move', leftControl: 1 },
  ],
}));

const save = vi.fn().mockResolvedValue(undefined);
const renderMoves = (characterId = 'character-a') => render(
  <ToastProvider>
    <Moves
      playbook="heavy"
      data={{ typeMoves: { 'picked-move': true } }}
      onSave={save}
      level={1}
      characterId={characterId}
    />
  </ToastProvider>,
);

beforeEach(() => {
  window.localStorage.clear();
  save.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('Selected only move filter', () => {
  it('starts with all moves, then remembers the chosen filter after remount', async () => {
    const user = userEvent.setup();
    const first = renderMoves();
    const toggle = screen.getByRole('switch', { name: 'Selected only' });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText('Unchosen Test Move')).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(screen.queryByText('Unchosen Test Move')).not.toBeInTheDocument();
    expect(screen.getByText('Chosen Test Move')).toBeInTheDocument();
    expect(screen.getByText('Always Granted Move')).toBeInTheDocument();
    expect(window.localStorage.getItem(selectedMovesPreferenceKey('character-a'))).toBe('1');
    first.unmount();

    const again = renderMoves();
    expect(screen.getByRole('switch', { name: 'Selected only' })).toBeChecked();
    expect(screen.queryByText('Unchosen Test Move')).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Selected only' }));
    expect(screen.getByText('Unchosen Test Move')).toBeInTheDocument();
    again.unmount();

    renderMoves();
    expect(screen.getByRole('switch', { name: 'Selected only' })).not.toBeChecked();
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps preferences separate for each character', async () => {
    const user = userEvent.setup();
    const first = renderMoves();
    await user.click(screen.getByRole('switch', { name: 'Selected only' }));
    first.unmount();

    const otherCharacter = renderMoves('character-b');
    expect(screen.getByRole('switch', { name: 'Selected only' })).not.toBeChecked();
    otherCharacter.unmount();

    renderMoves();
    expect(screen.getByRole('switch', { name: 'Selected only' })).toBeChecked();
  });

  it('remains usable if browser storage is unavailable', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const user = userEvent.setup();
    renderMoves();
    const toggle = screen.getByRole('switch', { name: 'Selected only' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
    get.mockRestore();
    set.mockRestore();
  });
});

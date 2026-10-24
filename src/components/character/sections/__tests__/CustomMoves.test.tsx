import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toastModuleMock } from '@/test/toastMock';

vi.mock('@/components/app/Toast/ToastContext', () => toastModuleMock());

import { CustomMoves } from '../CustomMoves';
import type { CharacterData } from '@/types';

const SEEDED: CharacterData = {
  customMoves: [{ id: 'm1', name: 'Placeholder Move', text: 'First line\nSecond line' }],
};

const renderMoves = (data?: CharacterData) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<CustomMoves data={data} onSave={onSave} />);
  return onSave;
};

// The Collapse hides its content until opened, so open it first.
const openCollapse = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /custom moves/i }));
};

describe('CustomMoves', () => {
  it('shows the empty message and a disabled Add button when nothing is saved or typed', async () => {
    const user = userEvent.setup();
    renderMoves();
    await openCollapse(user);
    expect(screen.getByText('No custom moves yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add move' })).toBeDisabled();
  });

  it('keeps Add disabled until both name and text have non-blank content', async () => {
    const user = userEvent.setup();
    renderMoves();
    await openCollapse(user);
    await user.type(screen.getByLabelText('Move name'), '   ');
    await user.type(screen.getByLabelText('Move text'), 'Some text');
    expect(screen.getByRole('button', { name: 'Add move' })).toBeDisabled();
    await user.type(screen.getByLabelText('Move name'), 'Named');
    expect(screen.getByRole('button', { name: 'Add move' })).toBeEnabled();
  });

  it('saves a trimmed move with a generated id and clears the form', async () => {
    const user = userEvent.setup();
    const onSave = renderMoves();
    await openCollapse(user);
    await user.type(screen.getByLabelText('Move name'), '  My Move  ');
    await user.type(screen.getByLabelText('Move text'), '  Does a thing  ');
    await user.click(screen.getByRole('button', { name: 'Add move' }));

    expect(onSave).toHaveBeenCalledWith({
      customMoves: [{ id: expect.any(String), name: 'My Move', text: 'Does a thing' }],
    });
    expect(screen.getByLabelText('Move name')).toHaveValue('');
    expect(screen.getByLabelText('Move text')).toHaveValue('');
    expect(screen.getByText('My Move')).toBeInTheDocument();
  });

  it('appends to existing moves instead of replacing them', async () => {
    const user = userEvent.setup();
    const onSave = renderMoves(SEEDED);
    await openCollapse(user);
    await user.type(screen.getByLabelText('Move name'), 'Second');
    await user.type(screen.getByLabelText('Move text'), 'Body');
    await user.click(screen.getByRole('button', { name: 'Add move' }));

    const saved = onSave.mock.calls[0][0].customMoves;
    expect(saved).toHaveLength(2);
    expect(saved[0].id).toBe('m1');
  });

  it('renders each line of the text as its own paragraph', async () => {
    const user = userEvent.setup();
    renderMoves(SEEDED);
    await openCollapse(user);
    expect(screen.getByText('First line')).toBeInTheDocument();
    expect(screen.getByText('Second line')).toBeInTheDocument();
  });

  it('asks for confirmation before removing, and cancel keeps the move', async () => {
    const user = userEvent.setup();
    const onSave = renderMoves(SEEDED);
    await openCollapse(user);
    await user.click(screen.getByRole('button', { name: 'Remove Placeholder Move' }));

    const dialog = screen.getByRole('dialog');
    expect(onSave).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Placeholder Move')).toBeInTheDocument();
  });

  it('removes only the confirmed move', async () => {
    const user = userEvent.setup();
    const onSave = renderMoves(SEEDED);
    await openCollapse(user);
    await user.click(screen.getByRole('button', { name: 'Remove Placeholder Move' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove move' }));

    expect(onSave).toHaveBeenCalledWith({ customMoves: [] });
    expect(screen.getByText('No custom moves yet.')).toBeInTheDocument();
  });
});

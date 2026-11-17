import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toastModuleMock } from '@/test/toastMock';
import type { CharacterData, FollowerData, GameSession } from '@/types';
import { FollowersInsert } from '../FollowersInsert';

vi.mock('@/components/app', () => toastModuleMock());

const game: GameSession = {
  id: 'game-1', name: 'Stonetop', createdAt: 0, characters: [],
  steading: { residents: [{ id: 'npc-1', name: 'Mara', occupation: 'Scout', notes: 'Knows the northern road.' }],
    neighbors: [{ id: 'npc-2', name: 'Bryn' }] },
};
const follower: FollowerData = { id: 'f-1', name: 'Original name', hp: '4', loyalty: 2, notes: 'Follower notes', gear: [{ text: 'Rope', checked: true, weight: 1 }] };
const mount = (followers: FollowerData[] = []) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const create = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn().mockResolvedValue(undefined);
  const data: CharacterData = { playbookFeatures: { followers } };
  const source = { game, characterId: 'pc-1', create, update };
  const view = render(<FollowersInsert data={data} onSave={onSave} followerNpcs={source} />);
  return { ...view, onSave, create, update, data, source };
};

describe('Followers linked to shared NPCs', () => {
  it('adds an existing resident or neighbor without creating a duplicate NPC', async () => {
    const { onSave, create } = mount();
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Add existing NPC as follower' }), 'npc-2');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].playbookFeatures.followers).toEqual([
      expect.objectContaining({ npcId: 'npc-2', name: 'Bryn' }),
    ]);
    expect(create).not.toHaveBeenCalled();
  });

  it('links an existing follower while preserving follower stats and gear', async () => {
    const { onSave } = mount([follower]);
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Link follower 1 to existing NPC' }), 'npc-1');
    expect(onSave.mock.calls[0][0].playbookFeatures.followers[0]).toMatchObject({ ...follower, gear: expect.arrayContaining(follower.gear!), npcId: 'npc-1' });
    expect(screen.getByLabelText('Follower 1 name')).toHaveValue('Mara');
    expect(screen.getByLabelText('Follower 1 name')).toHaveAttribute('readonly');
  });

  it('reads shared NPC changes live and edits the shared record', async () => {
    const { rerender, data, source, onSave, update } = mount([{ ...follower, npcId: 'npc-1' }]);
    expect(screen.getByText('Knows the northern road.')).toBeVisible();
    const nextGame = { ...game, steading: { residents: [{ id: 'npc-1', name: 'Mara the Scout', notes: 'Now at the bridge.' }] } };
    rerender(<FollowersInsert data={data} onSave={onSave} followerNpcs={{ ...source, game: nextGame }} />);
    expect(screen.getByLabelText('Follower 1 name')).toHaveValue('Mara the Scout');
    expect(screen.getByText('Now at the bridge.')).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit NPC' }));
    const dialog = within(screen.getByRole('dialog'));
    const name = dialog.getByRole('textbox', { name: /^Name/ });
    await user.clear(name); await user.type(name, 'Mara renamed');
    await user.click(dialog.getByRole('button', { name: 'Save NPC' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('npc-1', expect.objectContaining({ name: 'Mara the Scout' }), expect.objectContaining({ name: 'Mara renamed' })));
  });

  it('unlinks and removes a follower without changing or deleting the NPC', async () => {
    const { onSave, create, update } = mount([{ ...follower, npcId: 'npc-1' }]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Unlink NPC' }));
    const saved = onSave.mock.calls[0][0].playbookFeatures.followers[0];
    expect(saved).not.toHaveProperty('npcId');
    expect(saved).toMatchObject({ ...follower, gear: expect.arrayContaining(follower.gear!) });
    await user.click(screen.getByRole('button', { name: 'Remove Original name' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove follower' }));
    expect(onSave.mock.calls[onSave.mock.calls.length - 1][0].playbookFeatures.followers).toEqual([]);
    expect(create).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
    expect(game.steading?.residents?.[0].name).toBe('Mara');
  });

  it('preserves stats for a missing NPC and allows unlinking', async () => {
    mount([{ ...follower, npcId: 'deleted-npc' }]);
    expect(screen.getByText(/This NPC was deleted/)).toBeVisible();
    expect(screen.getByLabelText('Follower 1 current HP')).toHaveValue(4);
    expect(screen.getByRole('button', { name: 'Unlink NPC' })).toBeEnabled();
  });

  it('creates an NPC from a follower through the shared NPC form', async () => {
    const { create } = mount([follower]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Create NPC' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('textbox', { name: /^Name/ })).toHaveValue('Original name');
    await user.click(dialog.getByRole('button', { name: 'Save NPC' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: follower.id, hp: '4' }), expect.objectContaining({ name: 'Original name', notes: 'Follower notes', id: expect.any(String) })));
  });
});

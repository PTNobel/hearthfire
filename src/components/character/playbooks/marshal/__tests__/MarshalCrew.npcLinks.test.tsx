import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toastModuleMock } from '@/test/toastMock';
import type { CharacterData, GameSession, SteadingNPC } from '@/types';

vi.mock('@/components/app', () => toastModuleMock());

import { MarshalCrew } from '../MarshalCrew';

const resident: SteadingNPC = {
  id: 'npc-1', name: 'Aled the Scout', occupation: 'Soldier', traits: ['fearless'],
  pronouns: 'they/them', notes: 'Keeps watch by the old bridge.',
  relationships: [{ id: 'outgoing', targetId: 'npc-2', targetKind: 'neighbor', type: 'trusts' }],
};

const game: GameSession = {
  id: 'game-1', name: 'Stonetop', createdAt: 0, characters: [],
  steading: { residents: [resident], neighbors: [{
    id: 'npc-2', name: 'Bryn',
    relationships: [{ id: 'incoming', targetId: 'npc-1', targetKind: 'resident', type: 'owes a favor' }],
  }] },
};

const crewData = (linked = false): CharacterData => ({
  playbookFeatures: {
    crewIndividuals: [{ name: 'Mara', tag: 'brave', traits: 'a scout' }],
    ...(linked ? { crewNpcLinks: { '0': 'npc-1' } } : {}),
  },
});

const mount = (linked = false, initialGame = game, data = crewData(linked)) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onLinkNpc = vi.fn().mockResolvedValue(undefined);
  const onCreateNpc = vi.fn().mockResolvedValue(undefined);
  const onEditNpc = vi.fn().mockResolvedValue(undefined);
  const props = { data, onSave, characterId: 'marshal-1', prosperity: 1, onLinkNpc, onCreateNpc, onEditNpc };
  const view = render(<MarshalCrew {...props} game={initialGame} />);
  return { ...view, onSave, onLinkNpc, onCreateNpc, onEditNpc,
    updateGame: (next: GameSession) => view.rerender(<MarshalCrew {...props} game={next} />),
  };
};

describe('Marshal crew and shared Steading NPCs', () => {
  it('links an existing NPC without creating a duplicate', async () => {
    const user = userEvent.setup();
    const { onLinkNpc, onCreateNpc, onSave } = mount();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Link individual 1 to existing NPC' }), 'npc-1');
    expect(onLinkNpc).toHaveBeenCalledWith(0, 'npc-1');
    expect(onCreateNpc).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('displays the full shared NPC profile and edits the Steading record', async () => {
    const user = userEvent.setup();
    const { onEditNpc, onLinkNpc } = mount(true);
    const card = within(screen.getByRole('group', { name: 'Crew individual 1' }));
    for (const text of ['Aled the Scout', 'they/them', 'Soldier', 'fearless',
      'Keeps watch by the old bridge.', 'Aled the Scout → Bryn: trusts', 'Bryn → Aled the Scout: owes a favor']) {
      expect(card.getByText(text)).toBeVisible();
    }
    expect(card.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(card.getByText('Original Crew entry'));
    expect(card.getByText('Tag: brave')).toBeVisible();
    expect(card.getByText('Traits: a scout')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Edit Steading NPC for individual 1' }));
    const dialog = screen.getByRole('dialog');
    const modalName = within(dialog).getByRole('textbox', { name: /^Name/ });
    await user.clear(modalName);
    await user.type(modalName, 'Aled of Stonetop');
    await user.clear(within(dialog).getByRole('textbox', { name: 'Notes' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Notes' }), 'Now watches the gate.');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save NPC' })).toBeEnabled());
    await user.click(within(dialog).getByRole('button', { name: 'Save NPC' }));

    await waitFor(() => expect(onEditNpc).toHaveBeenCalledWith(
      'npc-1', expect.objectContaining({ name: 'Aled the Scout' }),
      expect.objectContaining({ name: 'Aled of Stonetop', notes: 'Now watches the gate.', traits: ['fearless'] }),
    ));
    expect(onLinkNpc).not.toHaveBeenCalled();
  });

  it('creates a new NPC from a named crew member without making six records', async () => {
    const user = userEvent.setup();
    const { onCreateNpc } = mount();
    await user.click(screen.getByRole('button', { name: 'Create Steading NPC from individual 1' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveValue('Mara');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save NPC' })).toBeEnabled());
    await user.click(within(dialog).getByRole('button', { name: 'Save NPC' }));
    await waitFor(() => expect(onCreateNpc).toHaveBeenCalledTimes(1));
    expect(onCreateNpc.mock.calls[0][0]).toBe(0);
    expect(onCreateNpc.mock.calls[0][1]).toMatchObject({
      name: 'Mara', occupation: 'Soldier', traits: ['brave', 'a scout'],
    });
    expect(onCreateNpc.mock.calls[0][1].id).toBeTruthy();
  });

  it('reflects remote NPC edits and relationship removals without writing a Crew copy', () => {
    const { updateGame, onSave, onEditNpc } = mount(true);
    updateGame({ ...game, steading: { residents: [{ ...resident,
      name: 'Aled of Stonetop', notes: 'Back from the Wood.', traits: ['cautious'], dead: true,
    }], neighbors: [{ id: 'npc-2', name: 'Bryn the Weaver' }] } });
    const card = within(screen.getByRole('group', { name: 'Crew individual 1' }));
    for (const text of ['Aled of Stonetop', 'Back from the Wood.', 'cautious', '(DEAD)',
      'Aled of Stonetop → Bryn the Weaver: trusts']) expect(card.getByText(text)).toBeVisible();
    expect(card.queryByText('fearless')).not.toBeInTheDocument();
    expect(card.queryByText(/owes a favor/)).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(onEditNpc).not.toHaveBeenCalled();
  });

  it('shows incoming relationships for a linked neighbor too', () => {
    const data = crewData(true);
    data.playbookFeatures!.crewNpcLinks = { '0': 'npc-2' };
    mount(true, game, data);
    const card = within(screen.getByRole('group', { name: 'Crew individual 1' }));
    expect(card.getByText('Aled the Scout → Bryn: trusts')).toBeVisible();
    expect(card.getByText('Bryn → Aled the Scout: owes a favor')).toBeVisible();
  });

  it('marks a deleted linked NPC as missing instead of showing the original Crew entry as current', async () => {
    const user = userEvent.setup();
    const { onLinkNpc } = mount(true, { ...game, steading: {} });
    const card = within(screen.getByRole('group', { name: 'Crew individual 1' }));
    expect(card.getByText('Linked NPC was removed. Unlink to choose another.')).toBeVisible();
    expect(card.queryByRole('textbox')).not.toBeInTheDocument();
    expect(card.queryByRole('button', { name: /Edit Steading NPC/ })).not.toBeInTheDocument();
    await user.click(card.getByRole('button', { name: 'Unlink individual 1 from Steading NPC' }));
    expect(onLinkNpc).toHaveBeenCalledWith(0, null);
  });

  it('deduplicates conversion traits without splitting descriptive text', async () => {
    const user = userEvent.setup();
    const data = crewData();
    data.playbookFeatures!.crewIndividuals = [{ name: 'Mara', tag: ' brave, loyal ', traits: 'brave, loyal' }];
    const { onCreateNpc } = mount(false, game, data);
    await user.click(screen.getByRole('button', { name: 'Create Steading NPC from individual 1' }));
    const save = within(screen.getByRole('dialog')).getByRole('button', { name: 'Save NPC' });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    await waitFor(() => expect(onCreateNpc).toHaveBeenCalledTimes(1));
    expect(onCreateNpc.mock.calls[0][1].traits).toEqual(['brave, loyal']);
  });
});

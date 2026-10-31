import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toastModuleMock } from '@/test/toastMock';
import type { CharacterData, GameSession, SteadingNPC } from '@/types';

vi.mock('@/components/app', () => toastModuleMock());

import { MarshalCrew } from '../MarshalCrew';

const resident: SteadingNPC = {
  id: 'npc-1', name: 'Aled the Scout', occupation: 'Soldier', traits: ['fearless'],
  relationships: [],
};

const game: GameSession = {
  id: 'game-1', name: 'Stonetop', createdAt: 0, characters: [],
  steading: { residents: [resident] },
};

const crewData = (linked = false): CharacterData => ({
  playbookFeatures: {
    crewIndividuals: [{ name: 'Mara', tag: 'brave', traits: 'a scout' }],
    ...(linked ? { crewNpcLinks: { '0': 'npc-1' } } : {}),
  },
});

const mount = (linked = false) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onLinkNpc = vi.fn().mockResolvedValue(undefined);
  const onCreateNpc = vi.fn().mockResolvedValue(undefined);
  const onEditNpc = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <MarshalCrew
      data={crewData(linked)}
      onSave={onSave}
      game={game}
      characterId="marshal-1"
      prosperity={1}
      onLinkNpc={onLinkNpc}
      onCreateNpc={onCreateNpc}
      onEditNpc={onEditNpc}
    />,
  );
  return { ...view, onSave, onLinkNpc, onCreateNpc, onEditNpc };
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

  it('displays the shared NPC name and edits the Steading record', async () => {
    const user = userEvent.setup();
    const { onEditNpc, onLinkNpc } = mount(true);
    const nameInput = screen.getByRole('textbox', { name: 'Individual 1 name' });
    expect(nameInput).toHaveValue('Aled the Scout');
    expect(nameInput).toHaveAttribute('readonly');
    const traitsInput = screen.getByRole('textbox', { name: 'Individual 1 traits' });
    expect(traitsInput).toHaveValue('fearless');
    expect(traitsInput).toHaveAttribute('readonly');

    await user.click(screen.getByRole('button', { name: 'Edit Steading NPC for individual 1' }));
    const dialog = screen.getByRole('dialog');
    const modalName = within(dialog).getByRole('textbox', { name: /^Name/ });
    await user.clear(modalName);
    await user.type(modalName, 'Aled of Stonetop');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save NPC' })).toBeEnabled());
    await user.click(within(dialog).getByRole('button', { name: 'Save NPC' }));

    await waitFor(() => expect(onEditNpc).toHaveBeenCalledWith(
      'npc-1', expect.objectContaining({ name: 'Aled the Scout' }),
      expect.objectContaining({ name: 'Aled of Stonetop' }),
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
      name: 'Mara', occupation: 'Soldier', traits: ['a scout'],
    });
    expect(onCreateNpc.mock.calls[0][1].id).toBeTruthy();
  });
});

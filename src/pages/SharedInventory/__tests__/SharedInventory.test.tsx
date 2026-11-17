import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { toastModuleMock } from '@/test/toastMock';
import type { GameSession } from '@/types';

vi.mock('@/hooks/useGame', () => ({ useGame: vi.fn() }));
vi.mock('@/components/app', () => toastModuleMock());
vi.mock('@/components/app/Toast/ToastContext', () => toastModuleMock());
import { PartyInventory } from '../SharedInventory';

const game: GameSession = { id: 'g1', name: 'Stonetop', createdAt: 0, steading: {
  prosperity: 1, residents: [{ id: 'npc-1', name: 'Mara' }],
}, characters: [
  { id: 'pc-1', name: 'Aerin', playbook: 'heavy', level: 1, data: {
    inventoryChecked: { rope: true }, inventoryPossessions: [{ text: 'Green cloak', checked: true, weight: 1 }],
    playbookFeatures: { followers: [{ id: 'f1', npcId: 'npc-1', name: 'Old name', hp: '4',
      gear: [{ text: 'Lantern', checked: true, weight: 1 }] }] },
  } },
  { id: 'pc-2', name: 'Bryn', playbook: 'marshal', level: 1, data: { playbookFeatures: {
    crewInventoryChecked: { supplies: true, hatchet: true }, crewSuppliesUses: [1, 0, 0, 0, 0, 0],
    crewCustomItems: [{ text: 'Tent', checked: true }], crewHp: '6',
  } } },
] };
const mount = () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const view = render(<MemoryRouter><PartyInventory game={game} onSaveCharacter={save} /></MemoryRouter>);
  return { ...view, save };
};

describe('shared inventory', () => {
  it('shows existing character, follower and crew gear with its owner', () => {
    mount();
    expect(within(screen.getByRole('region', { name: 'Aerin' })).getByText('Green cloak')).toBeVisible();
    const follower = within(screen.getByRole('region', { name: 'Mara — Follower gear' }));
    expect(follower.getByLabelText('Mara gear 1 name')).toHaveValue('Lantern');
    expect(follower.getByLabelText('Mara gear 1 equipped')).toBeChecked();
    const crew = within(screen.getByRole('region', { name: 'Bryn — Crew gear' }));
    expect(crew.getByLabelText('Crew custom gear 1 name')).toHaveValue('Tent');
    expect(crew.getByRole('group', { name: 'Crew member 1 supplies' })).toBeVisible();
  });

  it('filters by character and keeps their companions together', async () => {
    mount();
    await userEvent.setup().selectOptions(screen.getByLabelText('Show inventories'), 'pc-1');
    expect(screen.getByRole('region', { name: 'Mara — Follower gear' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Bryn — Crew gear' })).not.toBeInTheDocument();
  });

  it('edits a character inventory through the original save action', async () => {
    const { save } = mount();
    const user = userEvent.setup();
    const card = within(screen.getByRole('region', { name: 'Aerin' }));
    await user.click(card.getByRole('button', { name: 'Edit Aerin inventory' }));
    await user.click(card.getByRole('checkbox', { name: /Rope/ }));
    expect(save).toHaveBeenCalledWith('pc-1', expect.objectContaining({ inventoryChecked: { rope: false } }), { inventoryChecked: { rope: true } });
  });

  it('edits follower gear by follower ID and preserves stats and NPC links', () => {
    const { save } = mount();
    fireEvent.change(screen.getByLabelText('Mara gear 1 name'), { target: { value: 'Oil lantern' } });
    const [id, patch, before] = save.mock.calls[0];
    expect(id).toBe('pc-1');
    expect(patch.playbookFeatures.followers[0]).toMatchObject({ id: 'f1', hp: '4', npcId: 'npc-1', gear: expect.arrayContaining([expect.objectContaining({ text: 'Oil lantern', checked: true })]) });
    expect(before.playbookFeatures.followers).toEqual(game.characters[0].data?.playbookFeatures?.followers);
  });

  it('edits crew supplies and custom gear without copying other crew data', async () => {
    const { save } = mount();
    const user = userEvent.setup();
    await user.click(within(screen.getByRole('group', { name: 'Crew member 1 supplies' })).getByRole('button', { name: 'Use 2' }));
    expect(save).toHaveBeenCalledWith('pc-2', { playbookFeatures: { crewSuppliesUses: [2, 0, 0, 0, 0, 0] } }, expect.anything());
    fireEvent.change(screen.getByLabelText('Crew custom gear 1 name'), { target: { value: 'Large tent' } });
    expect(save.mock.calls[1][1].playbookFeatures.crewCustomItems[0]).toEqual({ checked: true, text: 'Large tent' });
  });

  it('reflects source inventory and linked NPC name changes', () => {
    const { rerender, save } = mount();
    const next: GameSession = { ...game, steading: { ...game.steading, residents: [{ id: 'npc-1', name: 'Mara the Scout' }] }, characters: [
      { ...game.characters[0], data: { ...game.characters[0].data, inventoryPossessions: [{ text: 'Blue cloak', checked: true, weight: 1 }] } }, game.characters[1],
    ] };
    rerender(<MemoryRouter><PartyInventory game={next} onSaveCharacter={save} /></MemoryRouter>);
    expect(within(screen.getByRole('region', { name: 'Aerin' })).getByText('Blue cloak')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Mara the Scout — Follower gear' })).toBeVisible();
  });
});

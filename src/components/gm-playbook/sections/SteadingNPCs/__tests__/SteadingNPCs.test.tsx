import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toastModuleMock } from '@/test/toastMock';

// useOptimisticField (via SteadingNPCs) pulls useToast from @/components/app.
// Mock the barrel so no ToastProvider is needed (its auto-dismiss timer would
// otherwise risk hanging teardown).
vi.mock('@/components/app', () => toastModuleMock());

import { SteadingNPCs } from '../SteadingNPCs';
import type { GameSession, SteadingNPC, SteadingData } from '@/types';

type SaveFn = (patch: Partial<SteadingData>) => Promise<void>;

const game: GameSession = {
  id: 'g1',
  name: 'Test Game',
  createdAt: 0,
  characters: [],
};

const npc = (id: string, overrides: Partial<SteadingNPC> = {}): SteadingNPC => ({
  id,
  name: `NPC ${id}`,
  ...overrides,
});

// Pull the residents array out of the latest patch the section writes to Firestore.
const residentsFrom = (spy: ReturnType<typeof vi.fn<SaveFn>>): SteadingNPC[] => {
  const calls = spy.mock.calls;
  return calls[calls.length - 1][0].residents ?? [];
};

let onSave: ReturnType<typeof vi.fn<SaveFn>>;
beforeEach(() => { onSave = vi.fn<SaveFn>().mockResolvedValue(undefined); });

const renderSection = (npcs: SteadingNPC[]) =>
  render(
    <SteadingNPCs section="residents" npcs={npcs} onSave={onSave} game={game} />,
  );

describe('SteadingNPCs mutations', () => {
  it('adds a new NPC via the modal and persists it to the residents array', async () => {
    renderSection([]);

    await userEvent.click(screen.getByRole('button', { name: /add npc/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /^name/i }), 'Mara');
    await userEvent.click(screen.getByRole('button', { name: /save npc/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const residents = residentsFrom(onSave);
    expect(residents).toHaveLength(1);
    expect(residents[0].name).toBe('Mara');
    expect(residents[0].id).toBeTruthy();
  });

  it('does not save an NPC with a blank name', async () => {
    renderSection([]);
    await userEvent.click(screen.getByRole('button', { name: /add npc/i }));
    // Save is disabled until a name is entered.
    expect(screen.getByRole('button', { name: /save npc/i })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('removes only the targeted NPC and preserves the rest', async () => {
    renderSection([npc('a', { name: 'Alda' }), npc('b', { name: 'Bram' })]);

    await userEvent.click(screen.getByRole('button', { name: /remove Alda/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const residents = residentsFrom(onSave);
    expect(residents.map((n) => n.name)).toEqual(['Bram']);
  });

  it('toggles an NPC dead, writing the dead flag without dropping the NPC', async () => {
    renderSection([npc('a', { name: 'Alda' })]);

    await userEvent.click(screen.getByRole('button', { name: /mark Alda as dead/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const residents = residentsFrom(onSave);
    expect(residents).toHaveLength(1);
    expect(residents[0].dead).toBe(true);
  });

  it('edits an existing NPC in place, keeping its id', async () => {
    renderSection([npc('a', { name: 'Alda' })]);

    await userEvent.click(screen.getByRole('button', { name: /edit Alda/i }));
    const dialog = screen.getByRole('dialog');
    const nameInput = within(dialog).getByRole('textbox', { name: /^name/i });
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Aldara');
    await userEvent.click(within(dialog).getByRole('button', { name: /save npc/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const residents = residentsFrom(onSave);
    expect(residents).toHaveLength(1);
    expect(residents[0].id).toBe('a');
    expect(residents[0].name).toBe('Aldara');
  });
});

describe('SteadingNPCs relationships', () => {
  const alda = npc('a', { name: 'Alda', relationships: [
    { id: 'a-b', type: 'mother', targetId: 'b', targetKind: 'resident' },
  ] });
  const bram = npc('b', { name: 'Bram' });
  const card = (name: string) => within(screen.getByRole('button', { name: `Edit ${name}` }).closest('[role="listitem"]') as HTMLElement);
  const residents = [alda, bram];
  const linkedGame = { ...game, steading: { residents } };

  it('shows a directed relationship on both cards without writing a reciprocal record', async () => {
    render(<SteadingNPCs section="residents" npcs={residents} onSave={onSave} game={linkedGame} />);

    expect(card('Alda').getByText('Alda → Bram: mother')).toBeInTheDocument();
    expect(card('Bram').getByText('Alda → Bram: mother')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Edit Bram' }));
    const dialog = within(screen.getByRole('dialog'));
    await userEvent.type(dialog.getByRole('textbox', { name: /^name/i }), 'well');
    await userEvent.click(dialog.getByRole('button', { name: /save npc/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = residentsFrom(onSave);
    expect(saved.find((n) => n.id === 'a')?.relationships).toEqual(alda.relationships);
    expect(saved.find((n) => n.id === 'b')?.relationships).toEqual([]);
  });

  it('includes incoming links across the residents and neighbors sections', () => {
    const neighborLink = { ...alda, relationships: [{ ...alda.relationships![0], targetKind: 'neighbor' as const }] };
    const crossSectionGame = { ...game, steading: { residents: [neighborLink], neighbors: [bram] } };
    render(<>
      <SteadingNPCs section="residents" npcs={[neighborLink]} onSave={onSave} game={crossSectionGame} />
      <SteadingNPCs section="neighbors" npcs={[bram]} onSave={onSave} game={crossSectionGame} />
    </>);
    expect(card('Alda').getByText('Alda → Bram: mother')).toBeInTheDocument();
    expect(card('Bram').getByText('Alda → Bram: mother')).toBeInTheDocument();
  });

  it('filters connected NPCs in either direction and excludes unrelated NPCs', () => {
    const npcs = [...residents, npc('c', { name: 'Cora' })];
    const props = { section: 'residents' as const, npcs, onSave, game: { ...game, steading: { residents: npcs } } };
    const { rerender } = render(<SteadingNPCs {...props} filterTargetId="a" />);
    expect(screen.getByRole('button', { name: 'Edit Bram' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Cora' })).not.toBeInTheDocument();
    rerender(<SteadingNPCs {...props} filterTargetId="b" />);
    expect(screen.getByRole('button', { name: 'Edit Alda' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Cora' })).not.toBeInTheDocument();
  });

  it('updates incoming labels after a rename and removes them immediately when the source is deleted', async () => {
    const { rerender } = render(<SteadingNPCs section="residents" npcs={residents} onSave={onSave} game={linkedGame} />);
    const renamed = [{ ...alda, name: 'Aldara' }, bram];
    rerender(<SteadingNPCs section="residents" npcs={renamed} onSave={onSave} game={{ ...game, steading: { residents: renamed } }} />);
    expect(card('Bram').getByText('Aldara → Bram: mother')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Aldara' }));
    expect(card('Bram').queryByText(/mother/)).not.toBeInTheDocument();
  });

  it('keeps reciprocal directions distinct and does not duplicate a self-link', () => {
    const npcs = [{ ...alda, relationships: [...alda.relationships!,
      { id: 'self', type: 'self', targetId: 'a', targetKind: 'resident' as const },
    ] }, { ...bram, relationships: [
      { id: 'b-a', type: 'child', targetId: 'a', targetKind: 'resident' as const },
    ] }];
    render(<SteadingNPCs section="residents" npcs={npcs} onSave={onSave} game={{ ...game, steading: { residents: npcs } }} />);
    for (const name of ['Alda', 'Bram']) {
      expect(card(name).getAllByText('Alda → Bram: mother')).toHaveLength(1);
      expect(card(name).getAllByText('Bram → Alda: child')).toHaveLength(1);
    }
    expect(card('Alda').getAllByText('Alda → Alda: self')).toHaveLength(1);
  });

  it('does not treat a PC link as an incoming link to an NPC with the same id', () => {
    const source = { ...alda, relationships: [{ ...alda.relationships![0], targetKind: 'pc' as const }] };
    const npcs = [source, bram];
    render(<SteadingNPCs section="residents" npcs={npcs} onSave={onSave} game={{ ...game, steading: { residents: npcs } }} />);
    expect(card('Bram').queryByText(/mother/)).not.toBeInTheDocument();
  });
});

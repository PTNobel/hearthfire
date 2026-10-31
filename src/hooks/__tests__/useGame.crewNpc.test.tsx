import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { firestoreMockModule, firestoreStore } from '@/test/firestoreMock';
import { changeQueue, emptyQueue } from '@/lib/syncStorage';
import { getGameSync } from '@/lib/gameSync';

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/firestore', () => firestoreMockModule());

import { useGame } from '../useGame';

let sequence = 0;
let id = '';
const form = {
  name: 'Mara', pronouns: 'she/her', occupation: 'Soldier',
  traits: ['brave'], relationships: [], notes: '',
};

beforeEach(async () => {
  id = 'crew-link-' + ++sequence;
  await changeQueue(id, () => emptyQueue(id));
  firestoreStore.reset();
  firestoreStore.set('games/' + id, {
    id, name: 'Test Game', createdAt: 0,
    characters: [{ id: 'marshal', name: 'Eira', playbook: 'marshal', level: 1, data: {} }],
    steading: { residents: [{ id: 'resident-1', name: 'Aled' }] },
  });
});

const mount = async () => {
  const hook = renderHook(() => useGame(id));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};
const commit = async () => {
  await getGameSync(id).send();
  const state = getGameSync(id).getSnapshot();
  if (state.queue.error) throw new Error(state.queue.error);
};

describe('Marshal Crew NPC links', () => {
  it('links and unlinks an existing NPC by stable ID without changing the NPC', async () => {
    const { result } = await mount();
    await act(async () => { await result.current.setCrewNpcLink('marshal', 0, 'resident-1'); });
    await commit();
    const linked = firestoreStore.get('games/' + id)!;
    const characters = linked.characters as Array<{ data: { playbookFeatures: { crewNpcLinks: Record<string, string> } } }>;
    expect(characters[0].data.playbookFeatures.crewNpcLinks['0']).toBe('resident-1');
    expect((linked.steading as { residents: { id: string }[] }).residents).toHaveLength(1);

    await act(async () => { await result.current.setCrewNpcLink('marshal', 0, null); });
    await commit();
    const updated = firestoreStore.get('games/' + id)!;
    const crew = (updated.characters as Array<{ data: { playbookFeatures: { crewNpcLinks: Record<string, string> } } }>)[0].data.playbookFeatures;
    expect(crew.crewNpcLinks['0']).toBeUndefined();
    expect((updated.steading as { residents: { id: string }[] }).residents).toHaveLength(1);
  });

  it('creates the NPC and its link as a single durable batch', async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.createCrewNpc('marshal', 1, { id: 'new-npc', ...form });
    });
    // Nothing is written to Firestore until the queued transaction commits.
    const before = firestoreStore.get('games/' + id)!;
    expect((before.steading as { residents: { id: string }[] }).residents).toHaveLength(1);
    await commit();

    const raw = firestoreStore.get('games/' + id)!;
    expect((raw.steading as { residents: { id: string; name: string }[] }).residents)
      .toEqual([{ id: 'resident-1', name: 'Aled' }, { id: 'new-npc', ...form }]);
    expect((raw.characters as Array<{ data: { playbookFeatures: { crewNpcLinks: Record<string, string> } } }>)[0]
      .data.playbookFeatures.crewNpcLinks['1']).toBe('new-npc');
  });

  it('edits shared NPC attributes without discarding other Steading fields', async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.updateCrewNpc('resident-1',
        { name: 'Aled', pronouns: '', occupation: '', traits: [], relationships: [], notes: '' },
        { name: 'Aled the Brave', pronouns: '', occupation: '', traits: [], relationships: [], notes: '' });
    });
    await commit();
    expect((firestoreStore.get('games/' + id)!.steading as { residents: { id: string; name: string }[] }).residents)
      .toEqual([{ id: 'resident-1', name: 'Aled the Brave' }]);
  });

  it('does not link a missing NPC or duplicate one in two crew slots', async () => {
    const { result } = await mount();
    await expect(result.current.setCrewNpcLink('marshal', 0, 'missing'))
      .rejects.toThrow('no longer exists');
    await act(async () => { await result.current.setCrewNpcLink('marshal', 0, 'resident-1'); });
    await expect(result.current.setCrewNpcLink('marshal', 1, 'resident-1'))
      .rejects.toThrow('already linked');
  });
});

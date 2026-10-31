import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { getGameSync } from '@/lib/gameSync';
import { diffValues, readPath, sameValue, type PathPart } from '@/lib/syncChanges';
import { mergeById, STEADING_ID_ARRAY_FIELDS, stripUndefined } from '@/lib/gameMutations';
import { isPlainObject } from '@/lib/typeGuards';
import type { DraftEdit } from '@/lib/syncStorage';
import type { Character, CharacterData, ContentLists, GameSession, LoggedRoll, SteadingData, SteadingNPC, SteadingNpcForm } from '@/types';

export { parseCharacterData, parseCharacters, parseContent, parseSteading } from '@/lib/gameParsing';

export interface UseGameResult {
  game: GameSession | null;
  loading: boolean;
  error: string | null;
  // Save promises acknowledge durable local acceptance. SaveStatus separately
  // reports server acknowledgment, failures, and conflicts.
  updateGameName: (name: string) => Promise<void>;
  updateCharacterName: (characterId: string, name: string) => Promise<void>;
  updateCharacterData: (characterId: string, data: Partial<CharacterData>, base?: Partial<CharacterData>) => Promise<void>;
  adjustCharacterStats: (characterId: string, deltas: Partial<Record<'statArmor' | 'statHp', number>>) => Promise<void>;
  updateContent: (field: keyof ContentLists, value: string) => Promise<void>;
  updateField: (field: keyof Pick<GameSession, 'threats' | 'iWonder'>, value: string) => Promise<void>;
  updateSteading: (patch: Partial<SteadingData>, base?: Partial<SteadingData>) => Promise<void>;
  setCrewNpcLink: (characterId: string, slot: number, npcId: string | null) => Promise<void>;
  createCrewNpc: (characterId: string, slot: number, npc: SteadingNPC) => Promise<void>;
  updateCrewNpc: (npcId: string, before: SteadingNpcForm, after: SteadingNpcForm) => Promise<void>;
  addCharacter: (character: Character) => Promise<void>;
  removeCharacter: (characterId: string) => Promise<void>;
  reorderCharacters: (characters: Character[]) => Promise<void>;
  logRoll: (roll: LoggedRoll) => Promise<void>;
  updateNotes: (key: string, html: string) => Promise<void>;
  claimNotesLock: (key: string) => Promise<boolean>;
  refreshNotesLock: (key: string) => Promise<void>;
  releaseNotesLock: (key: string, html: string) => Promise<void>;
  replaceGameData: (game: Record<string, unknown>) => Promise<void>;
}

const mergeRecord = (base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> => {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    next[key] = isPlainObject(value) ? mergeRecord(isPlainObject(base[key]) ? base[key] : {}, value) : value;
  }
  return next;
};

const validateCrewSlot = (game: GameSession | null, characterId: string, slot: number): Character => {
  if (!Number.isInteger(slot) || slot < 0 || slot >= 6) throw new Error('Invalid crew slot.');
  const character = game?.characters.find((c) => c.id === characterId && c.playbook === 'marshal');
  if (!character) throw new Error('Marshal character not found.');
  return character;
};

export const useGame = (gameId: string): UseGameResult => {
  const store = useMemo(() => getGameSync(gameId), [gameId]);
  const { game, raw, loading, error } = useSyncExternalStore(store.subscribe, store.getDataSnapshot);

  const edit = useCallback(async (path: PathPart[], before: unknown, after: unknown, label: string, extra: Partial<DraftEdit> = {}) => {
    if (!raw) throw new Error('Load this game before editing.');
    // Display parsing can supply harmless defaults (e.g. category: null).
    // When that displayed baseline is still current, compare the exact raw
    // value, including unknown fields, rather than writing those defaults back.
    const changes = diffValues(before, after, path).map((change) =>
      sameValue(change.before, readPath(game, change.path))
        ? { ...change, before: readPath(raw, change.path) } : change)
      .filter((change) => !sameValue(change.before, change.after));
    await store.enqueue(raw, changes, label, extra);
  }, [store, raw, game]);

  const updateGameName = useCallback((name: string) => edit(['name'], raw?.name, name, 'Game name'), [edit, raw]);
  const updateContent = useCallback((field: keyof ContentLists, value: string) =>
    edit(['content', field], isPlainObject(raw?.content) ? raw.content[field] : undefined, value, field), [edit, raw]);
  const updateField = useCallback((field: 'threats' | 'iWonder', value: string) => edit([field], raw?.[field], value, field), [edit, raw]);

  const addCharacter = useCallback((character: Character) => {
    const existing = game?.characters.find((c) => c.id === character.id);
    return edit(['characters', { id: character.id }], existing, existing ?? stripUndefined(character), 'Add character');
  }, [game, edit]);
  const removeCharacter = useCallback((id: string) => edit(['characters', { id }], game?.characters.find((c) => c.id === id), undefined, 'Remove character'), [game, edit]);
  const reorderCharacters = useCallback((characters: Character[]) => edit([], undefined, undefined, 'Character order', { order: characters.map((c) => c.id) }), [edit]);
  const updateCharacterName = useCallback((id: string, name: string) =>
    edit(['characters', { id }, 'name'], game?.characters.find((c) => c.id === id)?.name, name, 'Character name'), [game, edit]);

  const updateCharacterData = useCallback((id: string, patch: Partial<CharacterData>, original?: Partial<CharacterData>) => {
    const character = game?.characters.find((c) => c.id === id);
    if (!character) return Promise.reject(new Error('This character no longer exists.'));
    const base = { ...character.data, ...original };
    const next = mergeRecord(base, patch) as CharacterData;
    if (patch.deleteFeatureKeys?.length && next.playbookFeatures) {
      next.playbookFeatures = { ...next.playbookFeatures };
      for (const key of patch.deleteFeatureKeys) delete next.playbookFeatures[key];
    }
    if (patch.arcanaMinor) next.arcanaMinor = mergeById(base.arcanaMinor, patch.arcanaMinor, patch.removedArcanaMinorIds);
    if (patch.arcanaMajor) next.arcanaMajor = mergeById(base.arcanaMajor, patch.arcanaMajor, patch.removedArcanaMajorIds);
    delete next.deleteFeatureKeys;
    delete next.removedArcanaMinorIds;
    delete next.removedArcanaMajorIds;
    return edit(['characters', { id }, 'data'], stripUndefined(base), stripUndefined(next), (character.name || 'Character') + ' changes');
  }, [game, edit]);

  const adjustCharacterStats = useCallback((characterId: string, values: Partial<Record<'statArmor' | 'statHp', number>>) =>
    edit([], undefined, undefined, 'Stat adjustment', { deltas: { characterId, values } }), [edit]);

  const updateSteading = useCallback((patch: Partial<SteadingData>, original?: Partial<SteadingData>) => {
    const base = { ...game?.steading, ...original };
    const next = mergeRecord(base, patch) as SteadingData;
    for (const [field, sentinel] of Object.entries(STEADING_ID_ARRAY_FIELDS)) {
      const key = field as keyof typeof STEADING_ID_ARRAY_FIELDS;
      if (patch[key]) Object.assign(next, { [key]: mergeById<{ id: string }>(base[key], patch[key], patch[sentinel]) });
      delete next[sentinel];
    }
    if (patch.removedFixedItems) next.removedFixedItems = [...new Set([...(base.removedFixedItems ?? []), ...patch.removedFixedItems])];
    return edit(['steading'], stripUndefined(base), stripUndefined(next), 'Steading changes');
  }, [game, edit]);


  // A crew slot links to an existing Steading NPC by stable ID. Keep the
  // association separate from crewIndividuals: those six positional entries
  // have no entity IDs, and rewriting the entire array can lose parallel edits.
  const crewLinkPath = (characterId: string, slot: number): PathPart[] => [
    'characters', { id: characterId }, 'data', 'playbookFeatures', 'crewNpcLinks', String(slot),
  ];
  const setCrewNpcLink = useCallback(async (characterId: string, slot: number, npcId: string | null): Promise<void> => {
    const character = validateCrewSlot(game, characterId, slot);
    if (npcId !== null) {
      if (![...(game?.steading?.residents ?? []), ...(game?.steading?.neighbors ?? [])].some((npc) => npc.id === npcId)) {
        return Promise.reject(new Error('This Steading NPC no longer exists.'));
      }
      const links = character.data?.playbookFeatures?.crewNpcLinks ?? {};
      if (Object.entries(links).some(([key, id]) => Number(key) !== slot && id === npcId)) {
        return Promise.reject(new Error('This NPC is already linked to another crew member.'));
      }
    }
    const path = crewLinkPath(characterId, slot);
    return edit(path, readPath(raw, path), npcId ?? undefined, 'Link crew member to Steading NPC');
  }, [game, raw, edit]);

  const createCrewNpc = useCallback(async (characterId: string, slot: number, npc: SteadingNPC): Promise<void> => {
    validateCrewSlot(game, characterId, slot);
    if (!raw) return Promise.reject(new Error('Load this game before adding an NPC.'));
    if (!npc.id || !npc.name.trim()) return Promise.reject(new Error('Give this NPC a name.'));
    if ([...(game?.steading?.residents ?? []), ...(game?.steading?.neighbors ?? [])].some((n) => n.id === npc.id)) {
      return Promise.reject(new Error('This NPC already exists.'));
    }
    const linkPath = crewLinkPath(characterId, slot);
    if (readPath(raw, linkPath) !== undefined) {
      return Promise.reject(new Error('Unlink the current NPC before creating another.'));
    }
    // One immutable queued edit creates the Steading resident AND links the
    // Marshal's slot, so an interrupted save cannot commit only half the work.
    return store.enqueue(raw, [
      { path: ['steading', 'residents', { id: npc.id }], before: undefined, after: { ...npc, name: npc.name.trim() } },
      { path: linkPath, before: undefined, after: npc.id },
    ], 'Add Marshal crew member to Steading');
  }, [game, raw, store]);

  const updateCrewNpc = useCallback((npcId: string, before: SteadingNpcForm, after: SteadingNpcForm) => {
    const section = game?.steading?.residents?.some((npc) => npc.id === npcId) ? 'residents'
      : game?.steading?.neighbors?.some((npc) => npc.id === npcId) ? 'neighbors' : null;
    if (!section) return Promise.reject(new Error('This Steading NPC no longer exists.'));
    return edit(['steading', section, { id: npcId }], before, after, 'Crew NPC details');
  }, [game, edit]);

  const logRoll = useCallback((roll: LoggedRoll) => {
    const existing = game?.diceRolls?.find((r) => r.id === roll.id);
    return edit(['diceRolls', { id: roll.id }], existing, stripUndefined(roll), 'Dice roll');
  }, [game, edit]);

  const notes = useCallback((key: string, html: string, releaseLock = false) => {
    const leaseToken = store.notesToken(key);
    if (releaseLock) store.forgetNotesToken(key, leaseToken);
    return edit(['notes', key], isPlainObject(raw?.notes) ? raw.notes[key] : undefined, html, 'Notes', {
      notesKey: key, leaseToken, releaseLock,
    });
  }, [edit, raw, store]);
  const updateNotes = useCallback((key: string, html: string) => notes(key, html), [notes]);
  const releaseNotesLock = useCallback((key: string, html: string) => notes(key, html, true), [notes]);
  const replaceGameData = useCallback(async (restored: Record<string, unknown>) => {
    if (!navigator.onLine) throw new Error('Reconnect before restoring a game.');
    const queue = store.getSnapshot().queue;
    if (queue.pending.length || queue.sending || queue.conflict) throw new Error('Resolve and sync pending changes before restoring.');
    await edit([], undefined, undefined, 'Restore backup', { restore: stripUndefined(restored) });
    do {
      await store.send();
      const state = store.getSnapshot();
      if (state.queue.error || state.storageError) throw new Error(state.queue.error || state.storageError!);
      if (!navigator.onLine) throw new Error('Reconnect to finish restoring. The restore is saved on this device.');
    } while (store.getSnapshot().queue.pending.length || store.getSnapshot().queue.sending);
  }, [edit, store]);

  return { game, loading, error, updateGameName, updateCharacterName, updateCharacterData, adjustCharacterStats,
    updateContent, updateField, updateSteading, setCrewNpcLink, createCrewNpc, updateCrewNpc, addCharacter, removeCharacter, reorderCharacters, logRoll,
    updateNotes, claimNotesLock: store.claimNotes, refreshNotesLock: store.refreshNotes, releaseNotesLock, replaceGameData };
};

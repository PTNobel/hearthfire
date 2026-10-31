import { useState, useCallback, useMemo } from 'react';
import { useToast } from '@/components/app';
import { INSERT_TABS, getInsertTab, type InsertOption } from '@/lib/insertTabs';
import type { Character, CharacterData } from '@/types';

export const useInsertTabs = (
  character: Character,
  onSave: (data: Partial<CharacterData>, base?: Partial<CharacterData>) => Promise<void>,
  // How many tabs precede the inserts on the sheet (the static tabs plus this playbook's own).
  // Passed in from the caller's real tab list rather than hardcoded here: a hardcoded count
  // silently activated the wrong tab the moment a static tab was added.
  nonInsertTabCount: number,
  setActiveIndex: (i: number) => void,
) => {
  const { addToast } = useToast();
  const [addTabOpen, setAddTabOpen] = useState(false);
  const [removeInsert, setRemoveInsert] = useState<InsertOption | null>(null);

  const handleOpenAddTab = useCallback(() => setAddTabOpen(true), []);
  const handleCloseAddTab = useCallback(() => setAddTabOpen(false), []);

  const handleRequestRemoveInsert = useCallback((insert: InsertOption) => {
    setRemoveInsert(insert);
  }, []);

  const removeInsertHandlers = useMemo(
    () => Object.fromEntries(INSERT_TABS.map(({ id }) => [id, () => handleRequestRemoveInsert(id)])),
    [handleRequestRemoveInsert],
  );

  const handleCloseRemoveInsert = useCallback(() => setRemoveInsert(null), []);

  // Error/close/in-flight lifecycle is owned by RemoveInsertModal; let errors propagate.
  const handleConfirmRemoveInsert = useCallback(async () => {
    if (!removeInsert) return;
    const next = (character.data?.inserts ?? []).filter((i) => i !== removeInsert);
    const patch: Partial<CharacterData> = { inserts: next };
    // The insert's own playbookFeatures keys (e.g. Followers' `followers`) must be explicitly
    // deleted, not just omitted — updateCharacterData's merge is additive, so an omitted key
    // survives the spread and reappears from the freshly-read doc (issue #241).
    const deleteFeatureKeys = getInsertTab(removeInsert)?.deleteFeatureKeys;
    if (deleteFeatureKeys?.length) patch.deleteFeatureKeys = [...deleteFeatureKeys];
    await onSave(patch);
    setActiveIndex(0);
  }, [removeInsert, character.data, onSave, setActiveIndex]);

  const handleAddInsert = useCallback(async (insert: InsertOption) => {
    const current = character.data?.inserts ?? [];
    if (current.includes(insert)) {
      setAddTabOpen(false);
      return;
    }
    const next = [...current, insert];
    try {
      await onSave({ inserts: next });
      // Inserts render after every other tab and the new one is appended last, so its index is
      // the count of everything that precedes it plus its own position in the insert list.
      setActiveIndex(nonInsertTabCount + next.length - 1);
      setAddTabOpen(false);
    } catch {
      // Save failed — keep the modal open so the user knows it didn't take.
      addToast('Failed to add insert. Try again.', 'error');
    }
  }, [character.data, onSave, nonInsertTabCount, setActiveIndex, addToast]);

  return {
    addTabOpen,
    removeInsert,
    removeInsertHandlers,
    handleOpenAddTab,
    handleCloseAddTab,
    handleRequestRemoveInsert,
    handleCloseRemoveInsert,
    handleConfirmRemoveInsert,
    handleAddInsert,
  };
};

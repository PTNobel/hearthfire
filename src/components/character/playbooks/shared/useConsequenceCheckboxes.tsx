import { useCallback, useMemo } from 'react';
import { usePlaybookField } from '@/hooks/usePlaybookField';
import { resolvePlaybookFeatures } from '@/lib/resolvePlaybookFeatures';
import type { CharacterData, PlaybookFeatures } from '@/types';

type ConsequenceKey = Extract<{
  [K in keyof PlaybookFeatures]: PlaybookFeatures[K] extends Record<string, boolean> | undefined ? K : never;
}[keyof PlaybookFeatures], string>;

interface ConsequenceLabel {
  id: string;
  label: string;
}

export const useConsequenceCheckboxes = (
  data: CharacterData | undefined,
  saveImmediate: (patch: Partial<PlaybookFeatures>, base?: Partial<PlaybookFeatures>) => Promise<void>,
  consequenceKey: ConsequenceKey,
  labels: ConsequenceLabel[],
  isDisabled?: (id: string, checked: Record<string, boolean>) => boolean,
) => {
  const firestoreValue = (resolvePlaybookFeatures(data)[consequenceKey] as Record<string, boolean> | undefined) ?? {};

  const { value: checked, ref: checkedRef, save } = usePlaybookField(
    consequenceKey, firestoreValue, saveImmediate,
    'Failed to save.',
  );

  const handleChange = useCallback((id: string, isChecked: boolean) => {
    save({ ...checkedRef.current, [id]: isChecked });
  }, [save, checkedRef]);

  const updateChecked = useCallback((updater: (prev: Record<string, boolean>) => Record<string, boolean>) => {
    save(updater(checkedRef.current));
  }, [save, checkedRef]);

  const items = useMemo(() => labels.map((c) => ({
    id: c.id,
    label: c.label,
    disabled: isDisabled ? isDisabled(c.id, checked) : false,
  })), [labels, checked, isDisabled]);

  return { checked, items, onChange: handleChange, updateChecked };
};

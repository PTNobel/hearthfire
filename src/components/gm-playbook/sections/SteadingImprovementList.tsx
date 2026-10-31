import { useCallback, useMemo } from 'react';
import type { GmImprovement, SteadingData } from '@/types';
import { useOptimisticField } from '@/hooks/useOptimisticField';
import { ImprovementList } from './ImprovementList';
import type { SteadingImprovementListConfig } from './SteadingImprovementConfigs';

interface SteadingImprovementListProps {
  config: SteadingImprovementListConfig;
  items: string[] | undefined;
  improvements: Record<string, boolean> | undefined;
  gmImprovements: GmImprovement[] | undefined;
  removedFixedItems: string[] | undefined;
  onSave: (patch: Partial<SteadingData>) => Promise<void>;
}

/**
 * Shared list section for Steading Resources and Fortifications: a bulleted list
 * of fixed + improvement-derived + GM-granted items, plus a repeater of custom
 * entries. The two sections differ only by the `config` passed in.
 */
export const SteadingImprovementList = ({
  config,
  items,
  improvements = {},
  gmImprovements,
  removedFixedItems,
  onSave,
}: SteadingImprovementListProps) => {
  const { fieldKey, gmCategory, fixedItems, improvementItems, addLabel, itemLabel } = config;

  const firestoreItems = items ?? [];
  const { value: localItems, save } = useOptimisticField(
    firestoreItems,
    (next: string[]) => onSave({ [fieldKey]: next }),
  );

  const firestoreRemovedFixed = removedFixedItems ?? [];
  const { value: localRemovedFixed, save: saveRemovedFixed } = useOptimisticField(
    firestoreRemovedFixed,
    (next: string[]) => onSave({ removedFixedItems: next }),
  );

  const handleSave = useCallback((next: string[]) => save(() => next), [save]);
  const handleRemoveFixed = useCallback(
    (label: string) => saveRemovedFixed((current) => current.includes(label) ? current : [...current, label]),
    [saveRemovedFixed],
  );

  // Hide any improvement that a chosen upgrade replaces (e.g. Palisade once Stone Wall is enabled).
  const visibleImprovements = useMemo(() => {
    const replaced = new Set(
      improvementItems.filter((imp) => imp.replaces && improvements[imp.id]).map((imp) => imp.replaces!),
    );
    return improvementItems.filter((imp) => !replaced.has(imp.id));
  }, [improvementItems, improvements]);

  const extraItems = useMemo(
    () => (gmImprovements ?? []).filter((g) => g.completed && g.category === gmCategory && g.title).map((g) => g.title),
    [gmImprovements, gmCategory],
  );

  return (
    <ImprovementList
      fixedItems={fixedItems}
      improvementItems={visibleImprovements}
      extraItems={extraItems}
      customItems={localItems}
      improvements={improvements}
      onSave={handleSave}
      addLabel={addLabel}
      itemLabel={itemLabel}
      removedFixedItems={localRemovedFixed}
      onRemoveFixed={handleRemoveFixed}
    />
  );
};


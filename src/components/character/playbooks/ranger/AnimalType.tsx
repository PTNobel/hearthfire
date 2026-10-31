import { useCallback, useMemo } from 'react';
import { Checkbox, CheckboxGroup, Input, Text } from '@/components/ui';
import type { AnimalTypeConfig } from '@/types';
import styles from './RangerAnimalCompanion.module.css';

export interface TypePicksSectionProps {
  typeId: string;
  typeConfig: AnimalTypeConfig;
  // Extra picks granted by Magnificent Specimen (2 per take).
  bonusPicks: number;
  isSelected: boolean;
  picks: Record<string, boolean>;
  customText: string;
  customChecked: boolean;
  onPickChange: (id: string, checked: boolean) => void;
  onCustomChange: (typeId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onCustomBlur: (typeId: string) => void;
  onCustomCheckedChange: (typeId: string, checked: boolean) => void;
}

export const TypePicksSection = ({
  typeId,
  typeConfig,
  bonusPicks,
  isSelected,
  picks,
  customText,
  customChecked,
  onPickChange,
  onCustomChange,
  onCustomBlur,
  onCustomCheckedChange,
}: TypePicksSectionProps) => {
  const selectedCount = typeConfig.picks.filter((p) => !p.defaultChecked && picks[`${typeConfig.id}:${p.id}`]).length;
  const pickCount = typeConfig.pickCount + bonusPicks;
  const atMax = selectedCount + (customChecked ? 1 : 0) >= pickCount;

  const items = useMemo(() => typeConfig.picks.map((p) => {
    const key = `${typeConfig.id}:${p.id}`;
    const isDefault = !!p.defaultChecked;
    return {
      id: key,
      label: p.label,
      disabled: !isSelected || isDefault || (!picks[key] && atMax),
    };
  }), [typeConfig, isSelected, picks, atMax]);

  const checkedMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const p of typeConfig.picks) {
      const key = `${typeConfig.id}:${p.id}`;
      map[key] = p.defaultChecked ? true : (picks[key] ?? false);
    }
    return map;
  }, [typeConfig, picks]);

  const handleCustomChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onCustomChange(typeId, e),
    [typeId, onCustomChange],
  );
  const handleCustomBlur = useCallback(() => onCustomBlur(typeId), [typeId, onCustomBlur]);
  const handleCustomCheckedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onCustomCheckedChange(typeId, e.target.checked),
    [typeId, onCustomCheckedChange],
  );

  return (
    <div className={styles.typePicksSection}>
      <Text as="span" size="xs" color="muted" leading="normal">
        {`**HP** ${typeConfig.hp} **Armor** ${typeConfig.armor} (size) **Damage** ${typeConfig.damage} *(hand)*`}
      </Text>
      <Text as="span" size="xs" color="muted" leading="normal">Pick {pickCount} more:</Text>
      <CheckboxGroup
        items={items}
        checked={checkedMap}
        onChange={onPickChange}
        columns={2}
      />
      <div className={styles.typeCustomRow}>
        <Checkbox
          checked={customChecked}
          disabled={!isSelected || (!customChecked && atMax) || !customText}
          onChange={handleCustomCheckedChange}
          aria-label={`Mark custom pick for ${typeConfig.label} as active`}
        />
        <Input
          className={styles.typeCustomInput}
          type="text"
          value={customText}
          placeholder="Custom pick…"
          aria-label={`${typeConfig.label} custom pick`}
          disabled={!isSelected}
          onChange={handleCustomChange}
          onBlur={handleCustomBlur}
        />
      </div>
    </div>
  );
};

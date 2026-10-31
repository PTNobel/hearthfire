import { useState, useCallback } from 'react';
import { useLatest } from '@/hooks/useLatest';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { useCollapsibleSection } from '@/hooks/useCollapsibleSection';
import { useCharacterField } from '@/hooks/useCharacterField';
import { Checkbox, Input, Radio, RadioGroup, Text } from '@/components/ui';
import { useToast } from '@/components/app';
import { PlaybookSection } from '@/components/playbook/PlaybookSection';
import type { AppearanceRows } from '@/lib/characterCreation/appearanceOptions';
import type { CharacterData } from '@/types';
import styles from './Appearance.module.css';

const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

interface AppearanceProps {
  rows?: AppearanceRows;
  data?: CharacterData;
  onSave?: (data: Partial<CharacterData>, base?: Partial<CharacterData>) => Promise<void>;
}

export const Appearance = ({ rows, data, onSave }: AppearanceProps = {}) => {
  const { addToast } = useToast();
  const onSaveRef = useLatest(onSave);
  const [isCustom, setIsCustom] = useState<boolean>(Boolean(data?.appearanceCustom));
  const [customText, setCustomText] = useState<string>(data?.appearanceCustom ?? '');
  const customTextRef = useLatest(customText);

  const savePatch = useCallback((patch: Partial<CharacterData>, base?: Partial<CharacterData>) =>
    onSave?.(patch, base) ?? Promise.resolve(), [onSave]);
  const { value: selected, ref: selectedRef, save: saveSelected, pendingRef: appearancePendingRef } = useCharacterField(
    'appearance', data?.appearance ?? {}, savePatch,
    'Failed to save appearance.',
  );

  const saveCustomText = (value: string) =>
    onSaveRef.current?.({ appearanceCustom: value }) ?? Promise.resolve();
  const { onChange: debouncedCustomChange, flush: flushCustomOnBlur } = useDebouncedSave(saveCustomText, 1000);

  const isCompleteInit = Boolean(data?.appearanceCustom) ||
    (rows ? rows.every((_, i) => Boolean((data?.appearance ?? {})[String(i)])) : false);
  const { isCollapsed, handleToggleCollapse } = useCollapsibleSection(isCompleteInit);

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const rowIndex = Number(e.currentTarget.dataset.row);
    const value = e.currentTarget.value;
    saveSelected({ ...selectedRef.current, [String(rowIndex)]: value });
  }, [saveSelected, selectedRef]);

  const handleCustomToggle = useCallback(() => {
    const prevCustom = customTextRef.current;
    const next = !isCustom;
    setIsCustom(next);
    appearancePendingRef.current = true;
    if (!next) setCustomText('');
    onSaveRef.current?.({ appearanceCustom: next ? prevCustom : '' })
      .catch(() => { addToast('Could not preserve appearance. Keep this page open and retry.', 'error'); })
      .finally(() => { appearancePendingRef.current = false; });
  }, [isCustom, addToast, appearancePendingRef, customTextRef, onSaveRef]);

  const handleCustomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomText(value);
    debouncedCustomChange(value);
  }, [debouncedCustomChange]);

  const handleCustomBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    flushCustomOnBlur(e.target.value);
  }, [flushCustomOnBlur]);

  if (!rows) return <PlaybookSection title="Appearance" />;

  const warn = !isCustom && rows.some((_, i) => !selected[String(i)]);
  const isComplete = !warn;

  const summary = isCustom
    ? (customText.trim() || null)
    : rows.map((_, i) => selected[String(i)]).filter(Boolean).join(' • ');

  return (
    <PlaybookSection
      title="Appearance"
      chooseNote="1 on each line, or make something up"
      warn={warn}
      collapsible={isComplete}
      isCollapsed={isCollapsed}
      onToggleCollapse={handleToggleCollapse}
      forceChildren
    >
      {isCollapsed && isComplete && summary ? (
        <Text color="muted" className={styles.summary}>{summary}</Text>
      ) : (
        <div className={styles.rows}>
          {rows.map((options, rowIndex) => (
            <div key={options[0]} className={styles.row}>
              <RadioGroup legend={options.join(', ')} legendHidden className={styles.options}>
                {options.map((opt) => (
                  <Radio
                    key={opt}
                    name={`appearance-row-${rowIndex}`}
                    value={opt}
                    data-row={rowIndex}
                    checked={selected[String(rowIndex)] === opt}
                    disabled={isCustom}
                    onChange={handleSelect}
                    label={opt}
                  />
                ))}
              </RadioGroup>
            </div>
          ))}
          <div className={styles.row}>
            <Checkbox
              className={styles.customCheckbox}
              name="appearance-custom"
              value="custom"
              checked={isCustom}
              onChange={handleCustomToggle}
              label={
                isCustom ? (
                  <Input
                    className={styles.customInput}
                    value={customText}
                    placeholder="Describe your appearance…"
                    aria-label="Custom appearance"
                    onChange={handleCustomChange}
                    onBlur={handleCustomBlur}
                    onClick={stopPropagation}
                  />
                ) : (
                  <span className={styles.customLabel}>Custom</span>
                )
              }
            />
          </div>
        </div>
      )}
    </PlaybookSection>
  );
};

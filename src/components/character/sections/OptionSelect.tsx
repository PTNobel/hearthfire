import { useState, useEffect, useCallback, useRef } from 'react';
import { useLatest } from '@/hooks/useLatest';
import type { ReactNode } from 'react';
import { Radio, RadioGroup, Input, Text } from '@/components/ui';
import { useToastOptional } from '@/components/app/Toast/ToastContext';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { useFirestoreSync } from '@/hooks/useFirestoreSync';
import { useCollapsibleSection } from '@/hooks/useCollapsibleSection';
import { PlaybookSection } from '@/components/playbook/PlaybookSection';
import type { RadioOption } from '@/types';
import styles from './OptionSelect.module.css';

export const CUSTOM_VALUE = '__custom__';

// Older Firestore records stored the literal 'custom' for the Custom… option.
export const toCustomSentinel = (v: string | undefined) => (v === 'custom' ? CUSTOM_VALUE : (v ?? ''));

export interface OptionSelectProps {
  // `name` attribute shared by the radios, so they form one group.
  name?: string;
  title?: string;
  header?: ReactNode;
  instruction?: ReactNode;
  options?: RadioOption[];
  // Controlled by a value pair rather than a CharacterData slice: most callers
  // store their selection in playbookFeatures under their own key names, and
  // used to fake a CharacterData object just to get the value in here.
  value?: string;
  customValue?: string;
  // Always receives both halves — picking an option clears the custom text,
  // and editing the custom text implies the Custom… option is selected.
  onChange?: (value: string, customValue: string) => Promise<void> | void;
  overrideNote?: string;
  chooseNote?: string;
  noCustom?: boolean;
}

const syncTextareaHeight = (el: HTMLTextAreaElement) => {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

export const OptionSelect = ({
  name,
  title = 'Instinct',
  header,
  instruction,
  options,
  value,
  customValue,
  onChange,
  overrideNote,
  chooseNote,
  noCustom = false,
}: OptionSelectProps = {}) => {
  const [selected, setSelected] = useState<string>('');
  const [customText, setCustomText] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const customTextRef = useLatest(customText);
  const selectedRef = useLatest(selected);
  // Optional so the component still renders outside a ToastProvider, the same
  // allowance useDebouncedSave makes.
  const addToast = useToastOptional()?.addToast;
  const addToastRef = useLatest(addToast);
  const selectPendingRef = useRef(false);
  // Bumped when a select save settles so the component re-renders and
  // useFirestoreSync can flush a remote value deferred during that save.
  const [, setSelectTick] = useState(0);

  const saveCustomText = useCallback(
    (next: string) => Promise.resolve(onChange?.(CUSTOM_VALUE, next)).then(() => undefined),
    [onChange]
  );
  const { onChange: debouncedChange, flush: flushOnBlur, isPendingRef: customPendingRef } = useDebouncedSave(saveCustomText, 1000);

  // An undefined value means "caller has nothing to say yet" (data still
  // loading, or the key absent from the document) — hold the local state
  // rather than blanking a selection the user can see.
  useFirestoreSync(value, (remote) => { if (remote !== undefined) setSelected(remote); }, selectPendingRef);
  useFirestoreSync(customValue, (remote) => { if (remote !== undefined) setCustomText(remote); }, customPendingRef);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    syncTextareaHeight(el);
  }, [customText]);

  const hasSelection = !!selected && (noCustom || selected !== CUSTOM_VALUE || !!customText.trim());
  const { isCollapsed, handleToggleCollapse } = useCollapsibleSection(hasSelection);

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.currentTarget.value;
    const prev = selectedRef.current;
    selectPendingRef.current = true;
    setSelected(next);
    Promise.resolve()
      .then(() => onChange?.(next, ''))
      .catch(() => {
        // Without this the radio keeps showing a choice that never persisted, and
        // the rejection escapes unhandled. Roll back only if our pick is still the
        // one on screen — a newer pick may have superseded it. Mirrors
        // useOptimisticField, down to the toast text.
        setSelected((current) => (current === next ? prev : current));
        addToastRef.current?.('Failed to save.', 'error');
      })
      .finally(() => {
        selectPendingRef.current = false;
        setSelectTick((t) => t + 1);
      });
  }, [onChange, selectedRef, addToastRef]);

  const handleCustomChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setCustomText(next);
    debouncedChange(next);
  }, [debouncedChange]);

  const handleCustomBlur = useCallback(() => {
    flushOnBlur(customTextRef.current);
  }, [flushOnBlur, customTextRef]);

  if (!options) return <PlaybookSection title={title} overrideNote={overrideNote} />;
  if (overrideNote) return <PlaybookSection title={title} overrideNote={overrideNote} />;

  const warn = !selected || (!noCustom && selected === CUSTOM_VALUE && !customText.trim());

  const visibleOptions = isCollapsed && hasSelection
    ? options.filter((opt) => opt.value === selected)
    : options;
  const showCustom = !noCustom && (!isCollapsed || selected === CUSTOM_VALUE);

  return (
    <PlaybookSection
      title={title}
      choose={1}
      warn={warn}
      collapsible={hasSelection}
      isCollapsed={isCollapsed}
      onToggleCollapse={handleToggleCollapse}
      forceChildren
      chooseNote={chooseNote}
      overrideNote={overrideNote}
    >
      {header}
      {instruction && (
        <Text color="muted" className={styles.instruction}>{instruction}</Text>
      )}
      <RadioGroup legend={title} legendHidden className={styles.options}>
        {visibleOptions.map((opt) => (
          <div key={opt.value} className={styles.option}>
            <Radio
              name={name}
              value={opt.value}
              checked={selected === opt.value}
              onChange={handleSelect}
              label={
                <span className={styles.optionLabel}>
                  <span className={styles.optionTitle}>{opt.label}</span>
                  {opt.description && <Text as="span" size="sm" color="muted">{opt.description}</Text>}
                  {opt.subtitle && <Text as="span" size="sm" color="muted">{opt.subtitle}</Text>}
                </span>
              }
            />
            {(opt.detailAlways || selected === opt.value) && opt.detail}
          </div>
        ))}
        {showCustom && (
          <div className={styles.option}>
            <Radio
              name={name}
              value={CUSTOM_VALUE}
              checked={selected === CUSTOM_VALUE}
              onChange={handleSelect}
              label={
                selected === CUSTOM_VALUE ? (
                  <Input
                    multiline
                    ref={textareaRef}
                    value={customText}
                    aria-label={`Custom ${title.toLowerCase()}`}
                    onChange={handleCustomChange}
                    onBlur={handleCustomBlur}
                    placeholder={`Describe your ${title.toLowerCase()}…`}
                    onClick={(e) => e.stopPropagation()}
                    className={styles.customTextarea}
                    rows={1}
                  />
                ) : (
                  <span className={styles.customLabel}>Custom…</span>
                )
              }
            />
          </div>
        )}
      </RadioGroup>
    </PlaybookSection>
  );
};

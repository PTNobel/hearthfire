import { Fragment, useCallback, useEffect, useRef, useState, memo } from 'react';
import clsx from 'clsx';
import { Checkbox, CheckboxGroup, Input, Text } from '@/components/ui';
import { parseMarkdown } from '@/lib/parseMarkdown';
import type { MinorArcanum } from '@/types';
import { ArcanaCardHeader } from './ArcanaCardHeader';
import { ArcanaFollowerBlock } from './ArcanaFollowerBlock';
import { ArcanaTrackerRow } from './ArcanaTrackerRow';
import styles from './MinorArcanaCard.module.css';

interface MinorArcanaCardProps {
  arcanum: MinorArcanum;
  requirementsChecked: Record<string, boolean>;
  marksValue?: number;
  trackerValue?: number;
  statusChecks?: Record<string, boolean>;
  followerHp?: number[];
  followerLoyalty?: number;
  notes?: string;
  onToggleRequirement: (key: string, checked: boolean) => void;
  onMarksChange: (value: number) => void;
  onTrackerChange: (value: number) => void;
  onStatusChange: (id: string, checked: boolean) => void;
  onFollowerHpChange: (index: number, value: number) => void;
  onFollowerLoyaltyChange: (value: number) => void;
  onNotesChange: (value: string) => void;
  onRemove: () => void;
}

// A freeform textarea for a move's notesField (e.g. writing down bound souls' names). Optimistic
// local draft persisted on blur, matching AspectDie/HpInput's pattern for text inputs on array-backed
// arcana entries — re-syncs only when a genuinely new saved value arrives.
const NotesField = memo(({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => {
  const [draft, setDraft] = useState(value);
  const lastSaved = useRef(value);
  useEffect(() => {
    if (value === lastSaved.current) return;
    lastSaved.current = value;
    setDraft(value);
  }, [value]);
  const commit = useCallback(
    (next: string) => {
      if (next === lastSaved.current) return;
      lastSaved.current = next;
      onChange(next);
    },
    [onChange],
  );
  return (
    <Input
      multiline
      label={label}
      value={draft}
      rows={3}
      onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
      onBlur={(e) => commit(e.target.value)}
    />
  );
});

export const MinorArcanaCard = ({
  arcanum,
  requirementsChecked,
  marksValue,
  trackerValue,
  statusChecks,
  followerHp,
  followerLoyalty,
  notes,
  onToggleRequirement,
  onMarksChange,
  onTrackerChange,
  onStatusChange,
  onFollowerHpChange,
  onFollowerLoyaltyChange,
  onNotesChange,
  onRemove,
}: MinorArcanaCardProps) => {
  // Most requirements render as a single checkbox; requirementRepeats expands the
  // requirement at a given string index into multiple independently-checkable boxes
  // (e.g. "on three separate nights, do X" is one string but three tracked boxes).
  const reqSlotKeys = arcanum.requirements.map((_, i) => {
    const repeat = arcanum.requirementRepeats?.[i] ?? 1;
    return Array.from({ length: repeat }, (_, n) => `req${i}` + (repeat > 1 ? `-${n}` : ''));
  });
  const reqKeys = reqSlotKeys.flat();
  const marksTracker = arcanum.marksTracker;
  // Three unlock styles, in precedence order: marked circles (marksTracker), any one satisfied
  // alternative (unlockGroups), or a plain count of checked requirement boxes.
  const isMarksUnlocked = (marksValue ?? 0) >= (marksTracker?.max ?? 0);
  const isGroupUnlocked = !!arcanum.unlockGroups?.some((group) =>
    group.every((i) => reqSlotKeys[i].every((key) => !!requirementsChecked?.[key])),
  );
  const isCountUnlocked =
    reqKeys.filter((k) => requirementsChecked?.[k]).length >=
    (arcanum.requirementsUnlockAt ?? reqKeys.length);
  const isUnlocked = marksTracker
    ? isMarksUnlocked
    : arcanum.unlockGroups
      ? isGroupUnlocked
      : isCountUnlocked;

  const makeToggle = useCallback(
    (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
      onToggleRequirement(key, e.target.checked);
    },
    [onToggleRequirement],
  );

  const cx = clsx(styles.card, isUnlocked && styles.cardUnlocked);
  const { move } = arcanum;

  return (
    <div className={cx}>
      <ArcanaCardHeader
        id={arcanum.id}
        name={arcanum.name}
        tags={arcanum.tags}
        weight={arcanum.weight}
        onRemove={onRemove}
      />

      <div className={styles.description}>
        {parseMarkdown(arcanum.description)}
      </div>

      <div className={styles.requirements}>
        {marksTracker ? (
          <>
            <ArcanaTrackerRow
              label={marksTracker.label}
              total={marksTracker.max}
              checked={marksValue ?? 0}
              onChange={onMarksChange}
            />
            {/* The dots are the only control here — these lines describe what marking all the
                circles earns you, so they render as prose rather than as tickable tasks. */}
            {arcanum.requirements.map((requirement, i) => (
              <Text key={`req${i}-${requirement}`} font="serif">
                {requirement}
              </Text>
            ))}
          </>
        ) : (
          reqSlotKeys.map((slotKeys, i) => (
            <Fragment key={`req${i}`}>
              {arcanum.requirementsDivider?.index === i && (
                <Text as="span" font="serif" italic color="muted">
                  {arcanum.requirementsDivider.text}
                </Text>
              )}
              <label className={styles.reqRow}>
                <span className={styles.reqBoxes}>
                  {slotKeys.map((key) => (
                    <Checkbox
                      key={key}
                      checked={!!requirementsChecked?.[key]}
                      onChange={makeToggle(key)}
                    />
                  ))}
                </span>
                <Text as="span" font="serif">
                  {arcanum.requirements[i]}
                </Text>
              </label>
            </Fragment>
          ))
        )}
        {arcanum.requirementsNote && (
          <div className={styles.requirementsNote}>
            {parseMarkdown(arcanum.requirementsNote)}
          </div>
        )}
      </div>

      {isUnlocked && (
        <div className={styles.moveReveal}>
          <div className={styles.moveHeader}>
            <Text font="serif" weight="bold">
              {move.name}
            </Text>
            {move.subtitle && (
              <Text font="serif" italic color="muted">
                {move.subtitle}
              </Text>
            )}
          </div>

          {move.tracker && (
            <ArcanaTrackerRow
              label={move.tracker.label}
              total={move.tracker.max}
              checked={trackerValue ?? 0}
              onChange={onTrackerChange}
            />
          )}

          {move.statuses && (
            <CheckboxGroup
              label={move.statuses.label}
              items={move.statuses.items}
              checked={statusChecks ?? {}}
              onChange={onStatusChange}
              columns={2}
            />
          )}

          <div className={styles.moveText}>{parseMarkdown(move.text)}</div>

          {move.notesField && (
            <NotesField
              label={move.notesField.label}
              value={notes ?? ''}
              onChange={onNotesChange}
            />
          )}

          {move.follower && (
            <ArcanaFollowerBlock
              arcanaId={arcanum.id}
              follower={move.follower}
              followerHp={followerHp}
              onFollowerHpChange={onFollowerHpChange}
              loyaltyValue={followerLoyalty}
              onLoyaltyChange={onFollowerLoyaltyChange}
            />
          )}
        </div>
      )}
    </div>
  );
};

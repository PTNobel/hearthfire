import { useState, useCallback, useMemo, memo, type MutableRefObject } from 'react';
import { Button, Text, Tooltip } from '@/components/ui';
import { MINOR_ARCANA } from '@/lib/arcana/minor';
import type { MinorArcanum, ArcanaMinorEntry } from '@/types';
import { MinorArcanaCard } from './MinorArcanaCard';
import { AddArcanaModal } from './AddArcanaModal';
import styles from './ArcanaPanel.module.css';

interface MinorArcanaCardRowProps {
  entry: ArcanaMinorEntry;
  arcanum: MinorArcanum;
  onToggleRequirement: (id: string, key: string, checked: boolean) => void;
  onMarksChange: (id: string, value: number) => void;
  onTrackerChange: (id: string, value: number) => void;
  onStatusChange: (id: string, statusId: string, checked: boolean) => void;
  onFollowerHpChange: (id: string, index: number, value: number) => void;
  onFollowerLoyaltyChange: (id: string, value: number) => void;
  onNotesChange: (id: string, value: string) => void;
  onRemove: (id: string) => void;
}

const MinorArcanaCardRow = memo(({ entry, arcanum, onToggleRequirement, onMarksChange, onTrackerChange, onStatusChange, onFollowerHpChange, onFollowerLoyaltyChange, onNotesChange, onRemove }: MinorArcanaCardRowProps) => {
  const handleToggle = useCallback((key: string, checked: boolean) => onToggleRequirement(entry.id, key, checked), [entry.id, onToggleRequirement]);
  const handleMarks = useCallback((value: number) => onMarksChange(entry.id, value), [entry.id, onMarksChange]);
  const handleTracker = useCallback((value: number) => onTrackerChange(entry.id, value), [entry.id, onTrackerChange]);
  const handleStatus = useCallback((statusId: string, checked: boolean) => onStatusChange(entry.id, statusId, checked), [entry.id, onStatusChange]);
  const handleFollowerHp = useCallback((index: number, value: number) => onFollowerHpChange(entry.id, index, value), [entry.id, onFollowerHpChange]);
  const handleFollowerLoyalty = useCallback((value: number) => onFollowerLoyaltyChange(entry.id, value), [entry.id, onFollowerLoyaltyChange]);
  const handleNotes = useCallback((value: string) => onNotesChange(entry.id, value), [entry.id, onNotesChange]);
  const handleRemove = useCallback(() => onRemove(entry.id), [entry.id, onRemove]);
  return (
    <MinorArcanaCard
      arcanum={arcanum}
      requirementsChecked={entry.requirementsChecked}
      marksValue={entry.marksValue}
      trackerValue={entry.trackerValue}
      statusChecks={entry.statusChecks}
      followerHp={entry.followerHp}
      followerLoyalty={entry.followerLoyalty}
      notes={entry.notes}
      onToggleRequirement={handleToggle}
      onMarksChange={handleMarks}
      onTrackerChange={handleTracker}
      onStatusChange={handleStatus}
      onFollowerHpChange={handleFollowerHp}
      onFollowerLoyaltyChange={handleFollowerLoyalty}
      onNotesChange={handleNotes}
      onRemove={handleRemove}
    />
  );
});

interface MinorArcanaPanelProps {
  arcanaMinor: ArcanaMinorEntry[];
  arcanaMinorRef: MutableRefObject<ArcanaMinorEntry[]>;
  saveMinor: (next: ArcanaMinorEntry[], removedId?: string) => void;
}

export const MinorArcanaPanel = ({ arcanaMinor, arcanaMinorRef, saveMinor }: MinorArcanaPanelProps) => {
  const [minorModalOpen, setMinorModalOpen] = useState(false);

  const existingMinorIds = useMemo(() => arcanaMinor.map((a) => a.id), [arcanaMinor]);

  const handleAddMinor = useCallback(
    (arcanum: MinorArcanum) => {
      const entry: ArcanaMinorEntry = { id: arcanum.id, requirementsChecked: {} };
      if (arcanum.marksTracker) entry.marksValue = 0;
      if (arcanum.move.tracker) entry.trackerValue = 0;
      if (arcanum.move.follower) {
        const count = arcanum.move.follower.hpCount ?? 1;
        entry.followerHp = Array.from({ length: count }, () => arcanum.move.follower!.hp ?? 0);
        if (arcanum.move.follower.loyaltyStart !== undefined) {
          entry.followerLoyalty = arcanum.move.follower.loyaltyStart;
        }
      }
      saveMinor([...arcanaMinorRef.current, entry]);
      setMinorModalOpen(false);
    },
    [saveMinor, arcanaMinorRef],
  );

  const handleRandomMinor = useCallback(() => {
    const available = MINOR_ARCANA.filter((a) => !arcanaMinorRef.current.some((e) => e.id === a.id));
    if (available.length === 0) return;
    const pick = available[Math.floor(Math.random() * available.length)];
    handleAddMinor(pick);
  }, [handleAddMinor, arcanaMinorRef]);

  const handleRemoveMinor = useCallback(
    (id: string) => {
      saveMinor(arcanaMinorRef.current.filter((a) => a.id !== id), id);
    },
    [saveMinor, arcanaMinorRef],
  );

  const handleToggleRequirement = useCallback(
    (id: string, key: string, checked: boolean) => {
      saveMinor(arcanaMinorRef.current.map((a) =>
        a.id === id ? { ...a, requirementsChecked: { ...a.requirementsChecked, [key]: checked } } : a,
      ));
    },
    [saveMinor, arcanaMinorRef],
  );

  const handleMinorMarksChange = useCallback(
    (id: string, value: number) => {
      saveMinor(arcanaMinorRef.current.map((a) => (a.id === id ? { ...a, marksValue: value } : a)));
    },
    [saveMinor, arcanaMinorRef],
  );

  const handleMinorTrackerChange = useCallback(
    (id: string, value: number) => {
      saveMinor(arcanaMinorRef.current.map((a) => (a.id === id ? { ...a, trackerValue: value } : a)));
    },
    [saveMinor, arcanaMinorRef],
  );

  const handleMinorStatusChange = useCallback(
    (id: string, statusId: string, checked: boolean) => {
      saveMinor(arcanaMinorRef.current.map((a) =>
        a.id === id ? { ...a, statusChecks: { ...a.statusChecks, [statusId]: checked } } : a,
      ));
    },
    [saveMinor, arcanaMinorRef],
  );

  const handleMinorNotesChange = useCallback(
    (id: string, value: string) => {
      saveMinor(arcanaMinorRef.current.map((a) => (a.id === id ? { ...a, notes: value } : a)));
    },
    [saveMinor, arcanaMinorRef],
  );

  const handleMinorFollowerHpChange = useCallback(
    (id: string, index: number, value: number) => {
      saveMinor(arcanaMinorRef.current.map((a) => {
        if (a.id !== id) return a;
        const followerHp = [...(a.followerHp ?? [])];
        followerHp[index] = value;
        return { ...a, followerHp };
      }));
    },
    [saveMinor, arcanaMinorRef],
  );

  const handleMinorFollowerLoyaltyChange = useCallback(
    (id: string, value: number) => {
      saveMinor(arcanaMinorRef.current.map((a) => (a.id === id ? { ...a, followerLoyalty: value } : a)));
    },
    [saveMinor, arcanaMinorRef],
  );

  const handleOpenMinorModal = useCallback(() => setMinorModalOpen(true), []);
  const handleCloseMinorModal = useCallback(() => setMinorModalOpen(false), []);

  return (
    <>
      <div id="arcana-minor-panel" role="tabpanel" aria-labelledby="arcana-minor-tab" className={styles.panel}>
        <div className={styles.panelHeader}>
          <Button
            variant="secondary"
            size="sm"
            icon="plus"
            onClick={handleOpenMinorModal}
          >
            Add Minor Arcanum
          </Button>
          <Tooltip text="Add a random minor arcanum" side="right" noTabStop>
            <Button
              variant="secondary"
              size="sm"
              icon="dice"
              onClick={handleRandomMinor}
              aria-label="Add random minor arcanum"
            />
          </Tooltip>
        </div>

        {arcanaMinor.length === 0 ? (
          <Text color="muted" className={styles.empty}>
            No minor arcana yet. Add one when your character discovers an arcanum.
          </Text>
        ) : (
          <div className={styles.cardList}>
            {arcanaMinor.map((entry) => {
              const arcanum = MINOR_ARCANA.find((a) => a.id === entry.id);
              if (!arcanum) return null;
              return (
                <MinorArcanaCardRow
                  key={entry.id}
                  entry={entry}
                  arcanum={arcanum}
                  onToggleRequirement={handleToggleRequirement}
                  onMarksChange={handleMinorMarksChange}
                  onTrackerChange={handleMinorTrackerChange}
                  onStatusChange={handleMinorStatusChange}
                  onFollowerHpChange={handleMinorFollowerHpChange}
                  onFollowerLoyaltyChange={handleMinorFollowerLoyaltyChange}
                  onNotesChange={handleMinorNotesChange}
                  onRemove={handleRemoveMinor}
                />
              );
            })}
          </div>
        )}
      </div>

      <AddArcanaModal
        key={minorModalOpen ? 'open' : 'closed'}
        open={minorModalOpen}
        onClose={handleCloseMinorModal}
        onAdd={handleAddMinor}
        items={MINOR_ARCANA}
        existingIds={existingMinorIds}
        title="Add Minor Arcanum"
        noun="minor arcana"
        placeholder="e.g. scroll, wolf pelt, cave…"
      />
    </>
  );
};

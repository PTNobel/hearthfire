import { MAJOR_ARCANA } from '@/lib/arcana/major';
import type { ArcanaMajorEntry } from '@/types';

// Set an entry's marks and latch `everUnlocked` the first time marks reach the unlock threshold (the
// tracker's `unlockAt`, or its `max` when unspecified). Once latched it never clears, so an arcanum that
// erases all marks after each unlock keeps its Mysteries revealed. Never un-latches: erasing marks is
// the intended flow, not a mistake to undo.
export const withMarks = (entry: ArcanaMajorEntry, marksValue: number): ArcanaMajorEntry => {
  const marksTracker = MAJOR_ARCANA.find((m) => m.id === entry.id)?.frontTrackers.find(
    (t) => t.role === 'marks',
  );
  const threshold = marksTracker?.unlockAt ?? marksTracker?.max ?? 0;
  const everUnlocked = entry.everUnlocked || (threshold > 0 && marksValue >= threshold);
  return { ...entry, marksValue, everUnlocked };
};

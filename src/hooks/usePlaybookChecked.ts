import { useRef, useCallback } from 'react';
import { useLatest } from './useLatest';
import { resolvePlaybookFeatures, featurePatch } from '@/lib/resolvePlaybookFeatures';
import { useOptimisticField } from './useOptimisticField';
import type { CharacterData, PlaybookFeatures } from '@/types';

// Intentionally broad — callers are responsible for passing the right key type.
// A narrower mapped type resolves to `never` for optional keys in strict mode.
type FeatureKey = keyof PlaybookFeatures;

const SAVE_ERROR = 'Failed to save. Try again.';

// Frozen module-level defaults, not fresh `{}` literals: the seed value and the
// synced remote value must be reference-identical when the feature key is absent,
// or the first sync would re-render with an equal-but-new object every mount.
const EMPTY_CHECKED: Record<string, boolean> = {};
const EMPTY_ANSWERS: Record<string, string> = {};

const featureRecord = <T,>(data: CharacterData | undefined, key: FeatureKey, fallback: T): T =>
  (resolvePlaybookFeatures(data)[key] as T | undefined) ?? fallback;

interface UsePlaybookCheckedReturn {
  checked: Record<string, boolean>;
  handleChange: (id: string, value: boolean) => void;
}

interface UsePlaybookCheckedWithAnswersReturn extends UsePlaybookCheckedReturn {
  answers: Record<string, string>;
  handleAnswer: (key: string, value: string) => void;
  flushAnswers: () => void;
}

// The checkbox half, shared by both exported hooks. Delegates the optimistic
// value, failed-draft retention, error toast, and remote-echo gating to useOptimisticField
// rather than re-implementing them — that hook's useFirestoreSync also *defers*
// a remote value that lands mid-save and flushes it on settle, where the
// hand-rolled guard this replaced dropped it outright (#171).
const useCheckedField = (
  data: CharacterData | undefined,
  onSave: (data: Partial<CharacterData>, base?: Partial<CharacterData>) => Promise<void>,
  checkedKey: FeatureKey,
): UsePlaybookCheckedReturn => {
  const onSaveRef = useLatest(onSave);
  const dataRef = useLatest(data);

  const editBase = useRef(featureRecord(data, checkedKey, EMPTY_CHECKED));
  const { value: checked, save } = useOptimisticField(
    featureRecord(data, checkedKey, EMPTY_CHECKED),
    (next) => onSaveRef.current(featurePatch(dataRef.current, { [checkedKey]: next }), featurePatch(dataRef.current, { [checkedKey]: editBase.current })),
    SAVE_ERROR, undefined, editBase,
  );

  const handleChange = useCallback((id: string, value: boolean) => {
    // Transform form, so the next value is computed from the freshest committed
    // state — two quick toggles can't clobber each other through a stale closure.
    save((current) => ({ ...current, [id]: value }));
  }, [save]);

  return { checked, handleChange };
};

export const usePlaybookChecked = useCheckedField;

export const usePlaybookCheckedWithAnswers = (
  data: CharacterData | undefined,
  onSave: (data: Partial<CharacterData>, base?: Partial<CharacterData>) => Promise<void>,
  checkedKey: FeatureKey,
  answersKey: FeatureKey,
): UsePlaybookCheckedWithAnswersReturn => {
  const { checked, handleChange } = useCheckedField(data, onSave, checkedKey);
  const onSaveRef = useLatest(onSave);
  const dataRef = useLatest(data);

  const editBase = useRef(featureRecord(data, answersKey, EMPTY_ANSWERS));
  const { value: answers, save } = useOptimisticField(
    featureRecord(data, answersKey, EMPTY_ANSWERS),
    (next) => onSaveRef.current(featurePatch(dataRef.current, { [answersKey]: next }), featurePatch(dataRef.current, { [answersKey]: editBase.current })),
    SAVE_ERROR, undefined, editBase,
  );
  const handleAnswer = useCallback((key: string, value: string) => {
    void save((current) => ({ ...current, [key]: value }));
  }, [save]);
  const handleFlushAnswers = useCallback(() => {
    window.dispatchEvent(new Event('hearthfire:flush'));
  }, []);

  return { checked, handleChange, answers, handleAnswer, flushAnswers: handleFlushAnswers };
};

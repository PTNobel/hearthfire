import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { toastModuleMock } from '@/test/toastMock';

vi.mock('@/components/app', () => toastModuleMock());
vi.mock('@/components/app/Toast/ToastContext', () => toastModuleMock());

import { usePlaybookChecked, usePlaybookCheckedWithAnswers } from '../usePlaybookChecked';
import type { CharacterData } from '@/types';

afterEach(() => { vi.clearAllMocks(); });

const dataWith = (features: Record<string, unknown>): CharacterData =>
  ({ playbookFeatures: features } as CharacterData);

describe('usePlaybookChecked', () => {
  it('seeds checked state from the resolved feature key', () => {
    // Hoist data outside the render callback so its reference is stable — the
    // hook's sync effect depends on `data` and would otherwise re-fire forever.
    const data = dataWith({ marshalWarStories: { a: true } });
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePlaybookChecked(data, onSave, 'marshalWarStories'));
    expect(result.current.checked).toEqual({ a: true });
  });

  it('optimistically toggles and saves a patch containing only the changed key', async () => {
    const data = dataWith({ marshalWarStories: { a: true } });
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePlaybookChecked(data, onSave, 'marshalWarStories'));

    await act(async () => { result.current.handleChange('b', true); });
    expect(result.current.checked).toEqual({ a: true, b: true });
    // featurePatch emits only the changed key so useGame's transaction can deep-merge
    // against the freshly-read doc instead of clobbering it with a stale snapshot.
    expect(onSave).toHaveBeenCalledWith({ playbookFeatures: { marshalWarStories: { a: true, b: true } } }, { playbookFeatures: { marshalWarStories: { a: true } } });
  });

  it('retains the toggle when local acceptance fails', async () => {
    const data = dataWith({ marshalWarStories: { a: true } });
    const onSave = vi.fn().mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => usePlaybookChecked(data, onSave, 'marshalWarStories'));

    await act(async () => { result.current.handleChange('a', false); });
    expect(result.current.checked).toEqual({ a: false });
  });

  it('ignores an incoming data sync while a save is pending (no double-clobber)', async () => {
    let resolveSave: () => void = () => {};
    const onSave = vi.fn(() => new Promise<void>((r) => { resolveSave = r; }));
    const { result, rerender } = renderHook(
      ({ data }) => usePlaybookChecked(data, onSave, 'marshalWarStories'),
      { initialProps: { data: dataWith({ marshalWarStories: { a: true } }) } },
    );

    act(() => { result.current.handleChange('b', true); });
    // Remote echo arrives mid-save — must not overwrite the optimistic state.
    rerender({ data: dataWith({ marshalWarStories: { a: true } }) });
    expect(result.current.checked).toEqual({ a: true, b: true });

    await act(async () => { resolveSave(); });
  });

  it('applies a genuinely new remote value that arrived mid-save once the save settles (#171)', async () => {
    let resolveSave: () => void = () => {};
    const onSave = vi.fn(() => new Promise<void>((r) => { resolveSave = r; }));
    // Hoisted so each rerender passes a stable reference; an inline object would
    // re-fire the sync effect every render.
    const initial = dataWith({ marshalWarStories: { a: true } });
    const remote = dataWith({ marshalWarStories: { a: true, z: true } });
    const { result, rerender } = renderHook(
      ({ data }) => usePlaybookChecked(data, onSave, 'marshalWarStories'),
      { initialProps: { data: initial } },
    );

    act(() => { result.current.handleChange('b', true); });
    // Another device's edit lands while our own write is still in flight; it must be
    // deferred (not dropped) rather than clobbering the optimistic value.
    rerender({ data: remote });
    expect(result.current.checked).toEqual({ a: true, b: true });

    // Once our write settles the deferred value must actually be applied. Without a
    // deferred flush it is lost until some unrelated data change re-fires the effect.
    await act(async () => { resolveSave(); });
    expect(result.current.checked).toEqual({ a: true, z: true });
  });
});

describe('usePlaybookCheckedWithAnswers', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('submits every answer revision for durable acceptance', async () => {
    const data = dataWith({ marshalWarStories: {}, marshalWarStoriesAnswers: {} });
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () => usePlaybookCheckedWithAnswers(data, onSave, 'marshalWarStories', 'marshalWarStoriesAnswers'),
    );

    act(() => { result.current.handleAnswer('q1', 'partial'); });
    act(() => { result.current.handleAnswer('q1', 'final'); });
    expect(onSave).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenCalledWith({ playbookFeatures: { marshalWarStoriesAnswers: { q1: 'final' } } }, { playbookFeatures: { marshalWarStoriesAnswers: { q1: 'partial' } } });
  });

  it('flushes pending answers immediately on flushAnswers', async () => {
    const data = dataWith({ marshalWarStories: {}, marshalWarStoriesAnswers: {} });
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () => usePlaybookCheckedWithAnswers(data, onSave, 'marshalWarStories', 'marshalWarStoriesAnswers'),
    );

    act(() => { result.current.handleAnswer('q1', 'now'); });
    // flushAnswers bypasses the debounce timer and saves synchronously; await
    // the act so the save chain settles without advancing fake timers.
    await act(async () => { result.current.flushAnswers(); });
    expect(onSave).toHaveBeenCalledWith({
      playbookFeatures: { marshalWarStoriesAnswers: { q1: 'now' } },
    }, { playbookFeatures: { marshalWarStoriesAnswers: {} } });
  });

  it('prevents a double save by deduping repeated identical checkbox toggles', async () => {
    const data = dataWith({ marshalWarStories: {}, marshalWarStoriesAnswers: {} });
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () => usePlaybookCheckedWithAnswers(data, onSave, 'marshalWarStories', 'marshalWarStoriesAnswers'),
    );

    await act(async () => { result.current.handleChange('a', true); });
    expect(result.current.checked).toEqual({ a: true });
    expect(onSave).toHaveBeenCalledWith({
      playbookFeatures: { marshalWarStories: { a: true } },
    }, { playbookFeatures: { marshalWarStories: {} } });
  });
});

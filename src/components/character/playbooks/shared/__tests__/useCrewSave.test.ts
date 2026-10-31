import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCrewSave } from '../useCrewSave';

// Placeholder keys — the real ones are animal-type ids from the Ranger playbook.
const PATCH = { animalTypeCustom: { 'type-a': 'first' } };
const LATER_PATCH = { animalTypeCustom: { 'type-a': 'second' } };

// Local acceptance is immediate; advancing timers must not trigger another write.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('useCrewSave — how a failed write reaches the caller', () => {
  it('calls onError when the debounced write rejects', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('offline'));
    const onError = vi.fn();
    const { result } = renderHook(() => useCrewSave(undefined, onSave));

    act(() => { result.current.saveDebounced(PATCH, onError); });
    expect(onSave).toHaveBeenCalledWith({ playbookFeatures: PATCH }, undefined);

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(onSave).toHaveBeenCalledWith({ playbookFeatures: PATCH }, undefined);
    expect(onError).toHaveBeenCalled();
  });

  it('drops the failure silently when the caller passes no onError', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useCrewSave(undefined, onSave));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    act(() => { result.current.saveDebounced(PATCH); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    process.off('unhandledRejection', unhandled);

    // No crash and no warning — which is exactly why every call site has to pass
    // onError. A field that skips it looks identical whether the write landed or not.
    expect(onSave).toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('rejects the flushDebounce promise so a blur handler can catch it', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useCrewSave(undefined, onSave));
    const caught = vi.fn();

    // A blur submits its current value without waiting for an earlier acceptance.
    act(() => { result.current.saveDebounced(PATCH); });
    await act(async () => { await result.current.flushDebounce(LATER_PATCH).catch(caught); });

    // The blur payload wins — it carries whatever the field held at blur time.
    expect(onSave).toHaveBeenCalledWith({ playbookFeatures: LATER_PATCH }, undefined);
    expect(caught).toHaveBeenCalled();
  });

  it('accepts a blur value even without an earlier change event', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useCrewSave(undefined, onSave));

    await act(async () => { await result.current.flushDebounce(PATCH); });
    expect(onSave).toHaveBeenCalledWith({ playbookFeatures: PATCH }, undefined);
  });
});

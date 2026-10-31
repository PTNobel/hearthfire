import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedSave } from '../useDebouncedSave';

vi.mock('@/components/app/Toast/ToastContext', () => ({ useToastOptional: () => ({ addToast: vi.fn() }) }));

describe('local draft acceptance', () => {
  it('submits each revision immediately instead of leaving typing on a timer', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(save));
    await act(async () => { result.current.onChange('A'); result.current.onChange('AB'); });
    expect(save.mock.calls).toEqual([['A'], ['AB']]);
    expect(result.current.isPending).toBe(false);
  });
  it('does not block a newer draft behind an unresolved earlier request', async () => {
    let resolve: () => void = () => {};
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((r) => { resolve = r; })).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(save));
    await act(async () => { result.current.onChange('first'); result.current.onChange('latest'); });
    expect(save).toHaveBeenLastCalledWith('latest');
    expect(result.current.isPending).toBe(true);
    await act(async () => { resolve(); });
    expect(result.current.isPending).toBe(false);
  });
  it('an obsolete failure cannot make a newer accepted revision fail', async () => {
    let reject: (error: Error) => void = () => {};
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((_, r) => { reject = r; })).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(save));
    await act(async () => { result.current.onChange('first'); result.current.onChange('latest'); });
    await act(async () => { reject(new Error('old failure')); });
    expect(result.current.isPending).toBe(false);
  });
  it('retains a failed draft until a later attempt is accepted', async () => {
    const save = vi.fn().mockRejectedValue(new Error('storage unavailable'));
    const { result } = renderHook(() => useDebouncedSave(save));
    await act(async () => { await result.current.flush('draft'); });
    expect(result.current.isPendingRef.current).toBe(true);
    save.mockResolvedValue(undefined);
    await act(async () => { await result.current.flush('draft'); });
    expect(result.current.isPendingRef.current).toBe(false);
  });
  it('does not suppress a deliberate return to a previously submitted value', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(save));
    await act(async () => { await result.current.flush('B'); });
    result.current.noteRemoteValue('C');
    await act(async () => { await result.current.flush('B'); });
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('acknowledges a value only after local acceptance', async () => {
    let resolve: () => void = () => {};
    const save = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const accepted = vi.fn();
    const { result } = renderHook(() => useDebouncedSave(save, 1500, undefined, accepted));
    act(() => { result.current.onChange('draft'); });
    expect(accepted).not.toHaveBeenCalled();
    await act(async () => { resolve(); });
    expect(accepted).toHaveBeenCalledWith('draft');
  });
  it('has already submitted a draft when the component unmounts', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useDebouncedSave(save));
    await act(async () => { result.current.onChange('draft'); unmount(); });
    expect(save.mock.calls).toEqual([['draft']]);
  });
});

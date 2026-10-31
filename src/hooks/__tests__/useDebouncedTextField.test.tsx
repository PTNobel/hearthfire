import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedTextField } from '../useDebouncedTextField';

vi.mock('@/components/app/Toast/ToastContext', () => {
  const addToast = vi.fn();
  return { useToastOptional: () => ({ addToast }) };
});

describe('useDebouncedTextField', () => {
  it('keeps a failed local draft through remote snapshots and an exhausted retry', async () => {
    vi.useFakeTimers();
    try {
      const save = vi.fn().mockRejectedValue(new Error('offline'));
      const { result, rerender } = renderHook(({ remote }) => useDebouncedTextField(remote, save), {
        initialProps: { remote: 'original' },
      });
      act(() => { result.current.onChange({ target: { value: 'my draft' } } as React.ChangeEvent<HTMLInputElement>); });
      await act(async () => { vi.advanceTimersByTime(1500); });
      rerender({ remote: 'another player edited this' });
      expect(result.current.value).toBe('my draft');
      await act(async () => { vi.advanceTimersByTime(4000); });
      expect(save).toHaveBeenCalledTimes(2);
      rerender({ remote: 'another remote snapshot' });
      expect(result.current.value).toBe('my draft');
    } finally { vi.useRealTimers(); }
  });
});

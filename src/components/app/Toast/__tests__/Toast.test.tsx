import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal/Modal';
import { ToastProvider } from '../Toast';
import { useToast } from '../ToastContext';

const Trigger = ({ message }: { message: string }) => {
  const { addToast } = useToast();
  return <button onClick={() => addToast(message, 'error')}>{message}</button>;
};

describe('ToastProvider', () => {
  it('moves an existing notification inside an open dialog and back on close', () => {
    const Dialog = () => {
      const [open, setOpen] = useState(false);
      return <>
        <button onClick={() => setOpen(true)}>Open dialog</button>
        <Modal open={open} onClose={() => setOpen(false)} aria-labelledby="dialog-title">
          <h2 id="dialog-title">Confirmation</h2>
          <button onClick={() => setOpen(false)}>Cancel</button>
        </Modal>
      </>;
    };
    render(<ToastProvider><Trigger message="Save failed" /><Dialog /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Save failed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Save failed');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resumes a hover pause when moving the notification to a dialog', () => {
    vi.useFakeTimers();
    try {
      const Fixture = ({ open }: { open: boolean }) => <ToastProvider>
        <Trigger message="Save failed" />
        <Modal open={open} onClose={vi.fn()} aria-labelledby="dialog-title">
          <h2 id="dialog-title">Confirmation</h2>
        </Modal>
      </ToastProvider>;
      const { rerender } = render(<Fixture open={false} />);
      fireEvent.click(screen.getByRole('button', { name: 'Save failed' }));
      fireEvent.mouseEnter(screen.getByRole('alert'));
      rerender(<Fixture open />);
      expect(within(screen.getByRole('dialog')).getByRole('alert')).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(5200); });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it('does not restart a paused toast timer when its message repeats', () => {
    vi.useFakeTimers();
    try {
      render(<ToastProvider><Trigger message="Save failed" /></ToastProvider>);
      const button = screen.getByRole('button', { name: 'Save failed' });
      fireEvent.click(button);
      fireEvent.mouseEnter(screen.getByRole('alert'));
      fireEvent.click(button);
      act(() => { vi.advanceTimersByTime(10_000); });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      fireEvent.mouseLeave(screen.getByRole('alert'));
      act(() => { vi.advanceTimersByTime(5200); });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it('revives a repeated toast during its exit instead of overlapping a duplicate', () => {
    vi.useFakeTimers();
    try {
      render(<ToastProvider><Trigger message="Save failed" /></ToastProvider>);
      const button = screen.getByRole('button', { name: 'Save failed' });
      fireEvent.click(button);
      act(() => { vi.advanceTimersByTime(5100); });
      fireEvent.click(button);
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      act(() => { vi.advanceTimersByTime(200); });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(5000); });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it('shows an identical message only once while it is visible', () => {
    render(
      <ToastProvider>
        <Trigger message="Save failed" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save failed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save failed' }));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('a repeated message keeps the existing toast on screen longer', () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider>
          <Trigger message="Save failed" />
        </ToastProvider>
      );
      const button = screen.getByRole('button', { name: 'Save failed' });

      fireEvent.click(button);
      act(() => { vi.advanceTimersByTime(4000); });

      // The repeat at 4s restarts the 5s dismiss timer, so the toast is still
      // up at 8s — without the reset it would have dismissed at 5s.
      fireEvent.click(button);
      act(() => { vi.advanceTimersByTime(4000); });
      expect(screen.getAllByRole('alert')).toHaveLength(1);

      act(() => { vi.advanceTimersByTime(1500); });
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('still shows distinct messages alongside each other', () => {
    render(
      <ToastProvider>
        <Trigger message="Save failed" />
        <Trigger message="Other problem" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save failed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Other problem' }));
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });
});

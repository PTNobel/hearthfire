import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SaveStatusProvider } from '../SaveStatusProvider';
import { SaveStatus } from '../SaveStatus';
import { useSaveStatus } from '../SaveStatusContext';

let api: ReturnType<typeof useSaveStatus>;
const Capture = () => {
  // Test harness exposes the context for driving write events.
  // eslint-disable-next-line react-hooks/globals
  api = useSaveStatus();
  return null;
};
const renderWithProvider = () => render(
  <SaveStatusProvider><SaveStatus /><Capture /></SaveStatusProvider>,
);
afterEach(() => vi.restoreAllMocks());

describe('SaveStatus', () => {
  it('reports success only after all overlapping writes succeed', () => {
    renderWithProvider();
    act(() => { api.reportSaveStart(); api.reportSaveStart(); });
    act(() => { api.reportSaveSettled(true); });
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    act(() => { api.reportSaveSettled(true); });
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it.each([true, false])('reports a partial failure regardless of completion order (%s)', (first) => {
    renderWithProvider();
    act(() => { api.reportSaveStart(); api.reportSaveStart(); });
    act(() => { api.reportSaveSettled(first); });
    act(() => { api.reportSaveSettled(!first); });
    expect(screen.getByText('Save failed')).toBeInTheDocument();
    expect(api.lastSavedAt).toBeNull();
  });

  it('preserves the last successful timestamp without presenting a failure as Saved', () => {
    renderWithProvider();
    act(() => { api.reportSaveStart(); });
    act(() => { api.reportSaveSettled(true); });
    const savedAt = api.lastSavedAt;
    act(() => { api.reportSaveStart(); });
    act(() => { api.reportSaveSettled(false); });
    expect(api.lastSavedAt).toBe(savedAt);
    expect(screen.getByText('Save failed')).toBeInTheDocument();
    act(() => { api.reportSaveStart(); });
    act(() => { api.reportSaveSettled(true); });
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('shows unsaved drafts before debounce and until every field has saved', () => {
    renderWithProvider();
    act(() => { api.reportDraft('name', true); api.reportDraft('notes', true); });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    act(() => { api.reportDraft('name', true); });
    expect(api.pendingEdits).toBe(2);
    act(() => { api.reportSaveStart(); });
    act(() => { api.reportSaveSettled(true); api.reportDraft('name', false); });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    act(() => { api.reportDraft('notes', false); });
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('shows offline status without treating reconnection as a successful save', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    renderWithProvider();
    act(() => { api.reportDraft('notes', true); });
    online.mockReturnValue(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(screen.getByText('Offline')).toBeInTheDocument();
    online.mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });
});

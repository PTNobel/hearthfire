import { createContext, useContext } from 'react';

// 'idle' — nothing in flight and nothing saved this session yet (no indicator).
// 'saving' — at least one write is in flight.
// 'saved' — every write in the most recent batch succeeded.
// 'error' — at least one write in the most recent batch failed.
export type SaveStatusState = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveStatusContextValue {
  // Read side — consumed by the header status.
  status: SaveStatusState;
  // Epoch ms of the last successful save, or null if none yet this session.
  lastSavedAt: number | null;
  pendingEdits: number;
  reportDraft: (id: string, pending: boolean) => void;
  // Write side — called by useGame's reportSave wrapper as writes start and
  // settle. Saves are reference-counted so a sheet with many fields saving at
  // once reads as a single "Saving…" until the last one finishes.
  reportSaveStart: () => void;
  reportSaveSettled: (succeeded: boolean) => void;
}

// Context lives apart from the provider component so the data layer (useGame)
// can report status without importing the UI layer.
export const SaveStatusContext = createContext<SaveStatusContextValue | null>(null);

export type SaveStatusActions = Pick<SaveStatusContextValue, 'reportSaveStart' | 'reportSaveSettled' | 'reportDraft'>;

// Writers don't need to subscribe to the indicator's changing status or timestamp.
export const SaveStatusActionsContext = createContext<SaveStatusActions | null>(null);
export const useSaveStatusActionsOptional = (): SaveStatusActions | null =>
  useContext(SaveStatusActionsContext);

export const useSaveStatus = (): SaveStatusContextValue => {
  const ctx = useContext(SaveStatusContext);
  if (!ctx) throw new Error('useSaveStatus must be used inside SaveStatusProvider');
  return ctx;
};

// The indicator can also render outside a provider.
export const useSaveStatusOptional = (): SaveStatusContextValue | null =>
  useContext(SaveStatusContext);

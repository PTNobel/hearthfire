import { useCallback, useId, useRef, useState } from 'react';
import { Button, Tooltip } from '@/components/ui';
import { useToast } from '@/components/app';
import { exportGame, readImportFile, verifyBackupReady, UnsyncedBackupError, type GameExportEnvelope, type ImportSummary } from '@/lib/gameBackup';
import { useGameSyncOptional } from '@/components/app/SaveStatus/GameSyncContext';
import { useSaveStatusOptional } from '@/components/app/SaveStatus/SaveStatusContext';
import { useLatest } from '@/hooks/useLatest';
import { ImportGameModal } from './modals/ImportGameModal';
import styles from './GameDataActions.module.css';

interface GameDataActionsProps {
  gameId: string;
  gameName: string;
  onReplaceGameData: (game: Record<string, unknown>) => Promise<void>;
}

interface PendingImport {
  envelope: GameExportEnvelope;
  summary: ImportSummary;
}

export const GameDataActions = ({ gameId, gameName, onReplaceGameData }: GameDataActionsProps) => {
  const { addToast } = useToast();
  const store = useGameSyncOptional();
  const saveStatus = useLatest(useSaveStatusOptional());
  const checkBackupReady = useCallback(
    () => verifyBackupReady(gameId, store, saveStatus.current?.pendingEdits ?? 0),
    [gameId, store, saveStatus],
  );
  const exportTooltipId = useId();
  const importTooltipId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [pending, setPending] = useState<PendingImport | null>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const filename = await exportGame(gameId, undefined, checkBackupReady);
      addToast(`Downloaded ${filename}`, 'success');
    } catch (error) {
      addToast(
        error instanceof UnsyncedBackupError
          ? error.message
          : "Couldn't export this game — current server data is unavailable. Check your connection and try again.",
        'error',
      );
    } finally {
      setExporting(false);
    }
  }, [gameId, checkBackupReady, addToast]);

  const handleImportClick = useCallback(() => fileInputRef.current?.click(), []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear the input immediately so re-picking the same file after a rejection (or after
    // cancelling the confirm) still fires a change event.
    e.target.value = '';
    if (!file) return;

    let text: string;
    try {
      text = await file.text();
    } catch {
      addToast("Couldn't read that file. Try again.", 'error');
      return;
    }

    const check = readImportFile(text);
    if (!check.ok) {
      addToast(check.error, 'error');
      return;
    }
    setPending({ envelope: check.envelope, summary: check.summary });
  }, [addToast]);

  const handleCancelImport = useCallback(() => setPending(null), []);

  const handleConfirmImport = useCallback(async () => {
    if (!pending) return;

    // Snapshot the live doc to a file before overwriting it. This is the only undo path
    // the player has — an import is a full-document overwrite — so a failure here aborts
    // the import rather than proceeding without a net.
    try {
      await exportGame(gameId, 'before-import', checkBackupReady);
    } catch (error) {
      addToast(
        error instanceof UnsyncedBackupError
          ? 'Sync or resolve your local changes before importing. Nothing has changed.'
          : "Couldn't save a confirmed server backup, so the import was cancelled. Nothing has changed.",
        'error',
      );
      return;
    }

    try {
      await onReplaceGameData(pending.envelope.game);
    } catch (error) {
      // Durable sync rejections do not automatically emit an error toast.
      // Keep the confirmation open so the player can retry.
      const pendingChanges = error instanceof Error
        && error.message === 'Resolve and sync pending changes before restoring.';
      addToast(
        pendingChanges
          ? 'Sync or resolve pending changes before restoring a backup.'
          : "Couldn't restore this game. Check save status and try again.",
        'error',
      );
      return;
    }

    setPending(null);
    addToast('Game data restored from backup.', 'success');
  }, [pending, gameId, checkBackupReady, onReplaceGameData, addToast]);

  return (
    <>
      <Tooltip text="Export game" side="top" noTabStop tooltipId={exportTooltipId}>
        <Button
          variant="ghost"
          icon="download"
          size="sm"
          className={styles.actionBtn}
          onClick={handleExport}
          disabled={exporting}
          aria-label="Export game data"
          aria-describedby={exportTooltipId}
        />
      </Tooltip>

      <Tooltip text="Import game" side="top" noTabStop tooltipId={importTooltipId}>
        <Button
          variant="ghost"
          icon="upload"
          size="sm"
          className={styles.actionBtn}
          onClick={handleImportClick}
          aria-label="Import game data from a backup file"
          aria-describedby={importTooltipId}
        />
      </Tooltip>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className={styles.fileInput}
        onChange={handleFileChange}
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Mounted only while a validated file is staged, so the modal's own `importing`
          state resets on each open (same pattern as the other Game modals). */}
      {pending && (
        <ImportGameModal
          open
          gameId={gameId}
          currentName={gameName}
          envelope={pending.envelope}
          summary={pending.summary}
          onClose={handleCancelImport}
          onConfirm={handleConfirmImport}
        />
      )}
    </>
  );
};

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatest } from './useLatest';
import { NOTES_CLIENT_ID, NOTES_HEARTBEAT_MS, NOTES_IDLE_MS, NOTES_STALE_MS } from '@/lib/sharedNotes';
import type { NotesLock } from '@/types';
import { useGameSyncOptional } from '@/components/app/SaveStatus/GameSyncContext';

interface UseNotesLockArgs {
  // This notes key's lock as last seen in the game snapshot.
  lock: NotesLock | undefined;
  // Reads the editor's current content at the moment a save goes out.
  getHtml: () => string;
  claim: () => Promise<boolean>;
  refresh: () => Promise<void>;
  release: (html: string) => Promise<void>;
  save: (html: string) => Promise<void>;
  // Show that exclusive editing could not be acquired; never discard the draft.
  onClaimRejected: () => void;
}

// Lifecycle of this tab's hold on the lock. 'claiming' covers the transaction round-trip after the first
// keystroke; typing is preserved locally even if the claim fails.
type Hold = 'idle' | 'claiming' | 'held';

export const useNotesLock = ({ lock, getHtml, claim, refresh, release, save, onClaimRejected }: UseNotesLockArgs) => {
  const durable = !!useGameSyncOptional();
  const latest = useLatest({ getHtml, claim, refresh, release, save, onClaimRejected });
  const holdRef = useRef<Hold>('idle');
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBeatRef = useRef(0);
  // Local edits not yet written. Kept true after a failed write so a remote snapshot can't wipe them.
  const dirtyRef = useRef(false);
  const inFlightRef = useRef(0);

  // Another tab's lock counts only until NOTES_STALE_MS after we last saw it change. Timed from when this
  // tab received it — not the holder's `at` — so clock differences between devices can't matter here.
  // Every heartbeat changes `at`, which yields a new key and restarts the timer.
  const othersLockKey = lock && lock.clientId !== NOTES_CLIENT_ID ? `${lock.clientId}:${lock.at}` : null;
  const [expiredLockKey, setExpiredLockKey] = useState<string | null>(null);
  useEffect(() => {
    if (!othersLockKey) return;
    const timer = setTimeout(() => setExpiredLockKey(othersLockKey), NOTES_STALE_MS);
    return () => clearTimeout(timer);
  }, [othersLockKey]);
  const othersTyping = othersLockKey !== null && othersLockKey !== expiredLockKey;

  const track = useCallback((write: Promise<void>, onError?: () => void) => {
    inFlightRef.current += 1;
    write
      // The durable save status surfaces failures. Heartbeats are best-effort.
      .catch(() => onError?.())
      .finally(() => { inFlightRef.current -= 1; });
  }, []);

  // Save the current content and give up the lock. Called by the idle timer, on page hide, and on unmount.
  const releaseNow = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (holdRef.current !== 'held') return;
    holdRef.current = 'idle';
    dirtyRef.current = false;
    track(latest.current.release(latest.current.getHtml()), () => { dirtyRef.current = true; });
  }, [latest, track]);

  const rejectClaim = useCallback(() => {
    holdRef.current = 'idle';
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    latest.current.onClaimRejected();
  }, [latest]);

  // Wire to the editor's content-change event (not selection changes).
  const noteChange = useCallback(() => {
    dirtyRef.current = true;
    // Durable local acceptance happens on every change, independently of lock
    // acquisition and server availability. GameSync owns network debouncing.
    track(latest.current.save(latest.current.getHtml()), () => { dirtyRef.current = true; });
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      releaseNow();
    }, NOTES_IDLE_MS);

    if (holdRef.current === 'idle') {
      holdRef.current = 'claiming';
      inFlightRef.current += 1;
      latest.current.claim()
        .then((claimed) => {
          if (holdRef.current !== 'claiming') return;
          if (!claimed) { rejectClaim(); return; }
          holdRef.current = 'held';
          lastBeatRef.current = Date.now();
          // The idle timer already fired (or the component unmounted) while the claim was in flight.
          if (idleTimerRef.current === null) releaseNow();
        })
        .catch(() => { if (holdRef.current === 'claiming') rejectClaim(); })
        .finally(() => { inFlightRef.current -= 1; });
    } else if (holdRef.current === 'held' && Date.now() - lastBeatRef.current >= NOTES_HEARTBEAT_MS) {
      lastBeatRef.current = Date.now();
      track(latest.current.refresh());
    }
  }, [latest, releaseNow, rejectClaim, track]);

  // Save on blur without giving up the lock — it still releases NOTES_IDLE_MS after the last change.
  const noteBlur = useCallback(() => {
    if (!dirtyRef.current || holdRef.current !== 'held') return;
    dirtyRef.current = false;
    track(latest.current.save(latest.current.getHtml()), () => { dirtyRef.current = true; });
  }, [latest, track]);

  // GameSync projects every local edit before publishing its snapshot. Accept
  // that projection, including an explicit "keep shared" conflict resolution.
  // Standalone callers still need the legacy editor-level hold.
  const isBusy = useCallback(
    () => !durable && (holdRef.current !== 'idle' || inFlightRef.current > 0 || dirtyRef.current),
    [durable],
  );

  // Timers don't survive a closed tab or a backgrounded mobile app, so save and release right away rather
  // than leaving other screens locked out until the lock goes stale.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') releaseNow();
    };
    window.addEventListener('pagehide', releaseNow);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', releaseNow);
      document.removeEventListener('visibilitychange', handleVisibility);
      releaseNow();
    };
  }, [releaseNow]);

  return { othersTyping, noteChange, noteBlur, isBusy };
};

import { Navigate } from 'react-router-dom';
import { useSessionGameId } from '@/hooks/useSessionGameId';
import { lazy, Suspense } from 'react';

const SessionGame = lazy(() => import('./SessionGame').then((m) => ({ default: m.SessionGame })));

// An unadorned /game URL never grants access on its own.
export const SessionRoute = () => {
  const gameId = useSessionGameId();
  // Remount the sheet if another tab changes the remembered game, so it cannot
  // keep editing the previous game's subscription and local form state.
  return gameId ? <Suspense fallback={null}><SessionGame key={gameId} gameId={gameId} /></Suspense> : <Navigate to="/" replace />;
};

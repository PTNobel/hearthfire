import { Navigate, Outlet } from 'react-router-dom';
import { useSessionGameId } from '@/hooks/useSessionGameId';

// An unadorned /game URL never grants access on its own.
export const SessionRoute = () => {
  const gameId = useSessionGameId();
  // Remount the sheet if another tab changes the remembered game, so it cannot
  // keep editing the previous game's subscription and local form state.
  return gameId ? <Outlet key={gameId} /> : <Navigate to="/" replace />;
};

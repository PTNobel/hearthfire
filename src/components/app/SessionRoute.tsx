import { Navigate, Outlet } from 'react-router-dom';
import { getSessionGameId } from '@/lib/sessionGame';

// An unadorned /game URL never grants access on its own.
export const SessionRoute = () => (
  getSessionGameId() ? <Outlet /> : <Navigate to="/" replace />
);

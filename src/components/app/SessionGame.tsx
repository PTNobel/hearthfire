import { useMemo, useSyncExternalStore } from 'react';
import { Outlet } from 'react-router-dom';
import { getGameSync } from '@/lib/gameSync';
import { GameSyncContext } from './SaveStatus/GameSyncContext';
import { SaveStatus } from './SaveStatus/SaveStatus';

export const SessionGame = ({ gameId }: { gameId: string }) => {
  const store = useMemo(() => getGameSync(gameId), [gameId]);
  const state = useSyncExternalStore(store.subscribe, store.getDataSnapshot);
  return <GameSyncContext.Provider value={store}>
    {!state.loading && (!state.game || state.error) && <aside aria-label="Saved draft recovery"><SaveStatus /></aside>}
    <Outlet />
  </GameSyncContext.Provider>;
};

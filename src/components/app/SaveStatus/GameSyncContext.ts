import { createContext, useContext } from 'react';
import type { GameSync } from '@/lib/gameSync';

export const GameSyncContext = createContext<GameSync | null>(null);
export const useGameSyncOptional = () => useContext(GameSyncContext);

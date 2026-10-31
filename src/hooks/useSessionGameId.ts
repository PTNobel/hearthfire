import { useSyncExternalStore } from 'react';
import { getSessionGameId, subscribeSessionGameId } from '@/lib/sessionGame';

export const useSessionGameId = () => useSyncExternalStore(subscribeSessionGameId, getSessionGameId, () => null);

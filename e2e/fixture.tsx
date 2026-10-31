import { connectFirestoreEmulator, disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { getGameSync } from '../src/lib/gameSync';
import { changeQueue } from '../src/lib/syncStorage';

connectFirestoreEmulator(db, '127.0.0.1', 8085);
const gameId = 'hearthfire-test-session';
const api = {
  offline: async () => { localStorage.setItem('qa-offline', 'true'); await disableNetwork(db); },
  online: async () => { localStorage.removeItem('qa-offline'); await enableNetwork(db); await getGameSync(gameId).retry(); },
  queue: () => changeQueue(gameId),
  state: () => getGameSync(gameId).getSnapshot(),
};
Object.assign(window, { hearthfireQA: api });
if (localStorage.getItem('qa-offline')) await disableNetwork(db);
await import('../src/main');

declare global { interface Window { hearthfireQA: typeof api } }

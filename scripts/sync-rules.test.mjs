import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { renderRules } from './render-firestore-rules.mjs';

const session = 'hearthfire-test-session';
const game = { name: 'Test', createdAt: 0, characters: [] };
let env;
let db;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hearthfire',
    firestore: { host: '127.0.0.1', port: 8085, rules: renderRules(readFileSync('firestore.rules', 'utf8'), session) },
  });
  db = env.unauthenticatedContext().firestore();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'games', session), game); });
});
after(async () => { await env?.cleanup(); });

const commit = (id, revision = 1) => runTransaction(db, async (tx) => {
  const ref = doc(db, 'games', session);
  await tx.get(ref);
  tx.update(ref, { name: 'Edited', sync: { protocol: 2, revision, generation: 'legacy:0', lastWrite: id } });
  tx.set(doc(db, 'games', session, 'writes', id), { generation: 'legacy:0', committedAt: 1 });
});

test('upgrades a legacy game and writes its receipt atomically', async () => { await assertSucceeds(commit('one')); });
test('rejects an old tab both before and after migration', async () => {
  await assertFails(updateDoc(doc(db, 'games', session), { name: 'Old tab' }));
  await assertSucceeds(commit('one'));
  await assertFails(updateDoc(doc(db, 'games', session), { name: 'Old tab' }));
  await assertFails(setDoc(doc(db, 'games', session), game));
});
test('rejects a stale revision', async () => {
  await assertSucceeds(commit('one'));
  await assertFails(commit('two', 1));
  await assertSucceeds(commit('two', 2));
});
test('receipts cannot be forged independently or overwritten', async () => {
  const receipt = doc(db, 'games', session, 'writes', 'one');
  await assertFails(setDoc(receipt, { generation: 'legacy:0', committedAt: 1 }));
  await assertSucceeds(commit('one'));
  await assertFails(updateDoc(receipt, { committedAt: 2 }));
});
test('retains the session boundary and prohibits listing games or receipts', async () => {
  await assertFails(getDocs(collection(db, 'games')));
  await assertFails(getDocs(collection(db, 'games', session, 'writes')));
  await assertFails(setDoc(doc(db, 'games', 'different-session'), { ...game, sync: { protocol: 2, revision: 0, generation: 'new' } }));
});

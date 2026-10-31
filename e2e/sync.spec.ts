import { test, expect, chromium } from '@playwright/test';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {} from './fixture';

const id = 'hearthfire-test-session';
let env: RulesTestEnvironment;
test.beforeAll(async () => {
  const rules = readFileSync('firestore.rules', 'utf8').replace('return false; // HEARTHFIRE_SESSION_ID', `return id == '${id}';`);
  env = await initializeTestEnvironment({ projectId: 'demo-hearthfire', firestore: { host: '127.0.0.1', port: 8085, rules } });
});
test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'games', id), {
      name: 'Test game', createdAt: 0,
      characters: [{ id: 'pc-a', name: 'Character A', playbook: 'heavy', level: 1, data: { inventoryOtherThings: 'Original' } }],
      steading: { residents: [{ id: 'npc-a', name: 'NPC A', occupation: 'Farmer' }, { id: 'npc-b', name: 'NPC B', occupation: 'Smith' }] },
    });
  });
});
test.afterAll(async () => { await env.cleanup(); });

test('latest offline typing survives a complete browser restart and syncs once reconnected', async ({ browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'Persistent-profile recovery runs in Chromium.');
  const profile = mkdtempSync(join(tmpdir(), 'hearthfire-sync-'));
  const launchOptions = testInfo.project.use.launchOptions;
  let context = await chromium.launchPersistentContext(profile, { ...launchOptions, headless: true });
  let offline = false;
  const blockBackend = async () => {
    await context.route('http://127.0.0.1:8085/**', (route) => offline ? route.abort() : route.continue());
  };
  try {
    await blockBackend();
    let page = await context.newPage();
    await page.goto('http://127.0.0.1:4175/');
    await page.evaluate((gameId) => localStorage.setItem('hearthfire:session-game-id', gameId), id);
    await page.goto('http://127.0.0.1:4175/game/heavy#inventory');
    const other = page.getByLabel('Other things', { exact: true });
    // The first visit also builds Vite's lazy playbook chunks on cold CI hosts.
    await expect(other).toHaveValue('Original', { timeout: 15_000 });
    offline = true;
    await page.evaluate(() => window.hearthfireQA.offline());
    await other.fill('First draft');
    await other.fill('Latest offline draft');
    await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Latest offline notes');
    await expect.poll(() => page.evaluate(async () => JSON.stringify(await window.hearthfireQA.queue()))).toContain('Latest offline draft');
    await expect.poll(() => page.evaluate(async () => JSON.stringify(await window.hearthfireQA.queue()))).toContain('Latest offline notes');
    await testInfo.attach('before-restart', { body: JSON.stringify(await page.evaluate(async () => ({ queue: await window.hearthfireQA.queue(), state: window.hearthfireQA.state() })), null, 2), contentType: 'application/json' });
    await context.close();
    context = await chromium.launchPersistentContext(profile, { ...launchOptions, headless: true });
    await blockBackend();
    page = await context.newPage();
    await page.goto('http://127.0.0.1:4175/game/heavy#inventory');
    await expect.poll(() => page.evaluate(() => window.hearthfireQA.state().loading)).toBe(false);
    await testInfo.attach('after-restart', { body: JSON.stringify(await page.evaluate(async () => ({ queue: await window.hearthfireQA.queue(), state: window.hearthfireQA.state() })), null, 2), contentType: 'application/json' });
    await expect(page.getByLabel('Other things', { exact: true })).toHaveValue('Latest offline draft');
    await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveText('Latest offline notes');
    offline = false;
    await page.evaluate(() => window.hearthfireQA.online());
    await expect.poll(async () => {
      const snap = await getDoc(doc(env.unauthenticatedContext().firestore(), 'games', id));
      return snap.data()?.characters[0].data.inventoryOtherThings;
    }).toBe('Latest offline draft');
    await expect.poll(async () => (await getDoc(doc(env.unauthenticatedContext().firestore(), 'games', id))).data()?.notes?.['pc-a']).toContain('Latest offline notes');
    await expect.poll(() => page.evaluate(async () => (await window.hearthfireQA.queue()).error ?? 'clear')).toBe('clear');
    await expect(page.getByRole('button', { name: 'Save status: Saved', exact: true })).toBeVisible();
  } finally { await context.close(); rmSync(profile, { recursive: true, force: true }); }
});

test('independent NPC forms merge and a stale form does not restore another deleted NPC', async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    for (const context of [a, b]) await context.addInitScript((gameId) => localStorage.setItem('hearthfire:session-game-id', gameId), id);
    const first = await a.newPage();
    const second = await b.newPage();
    for (const page of [first, second]) await page.goto('http://127.0.0.1:4175/game/steading#npcs');
    await first.getByRole('button', { name: 'Edit NPC A', exact: true }).click();
    await second.getByRole('button', { name: 'Edit NPC B', exact: true }).click();
    await first.getByRole('dialog').getByLabel('Occupation', { exact: true }).fill('Edited A');
    await second.getByRole('dialog').getByLabel('Occupation', { exact: true }).fill('Edited B');
    await Promise.all([
      first.getByRole('button', { name: 'Save NPC', exact: true }).click(),
      second.getByRole('button', { name: 'Save NPC', exact: true }).click(),
    ]);
    await expect(first.getByRole('button', { name: 'Save status: Saved', exact: true })).toBeVisible();
    await expect(second.getByRole('button', { name: 'Save status: Saved', exact: true })).toBeVisible();
    const stored = () => getDoc(doc(env.unauthenticatedContext().firestore(), 'games', id));
    expect((await stored()).data()?.steading.residents.map((npc: { occupation: string }) => npc.occupation)).toEqual(['Edited A', 'Edited B']);
    await second.getByRole('button', { name: 'Edit NPC B', exact: true }).click();
    await first.getByRole('button', { name: 'Remove NPC A', exact: true }).click();
    await expect.poll(async () => (await stored()).data()?.steading.residents.length).toBe(1);
    await second.getByRole('dialog').getByLabel('Occupation', { exact: true }).fill('Another edit');
    await second.getByRole('button', { name: 'Save NPC', exact: true }).click();
    await expect.poll(async () => (await stored()).data()?.steading.residents[0].occupation).toBe('Another edit');
    expect((await stored()).data()?.steading.residents).toHaveLength(1);
  } finally { await a.close(); await b.close(); }
});

test('competing edits retain both versions and require an explicit resolution', async ({ browser }, testInfo) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    for (const context of contexts) await context.addInitScript((gameId) => localStorage.setItem('hearthfire:session-game-id', gameId), id);
    const [a, b] = await Promise.all(contexts.map((context) => context.newPage()));
    for (const page of [a, b]) {
      await page.goto('http://127.0.0.1:4175/game/steading#npcs');
      await page.getByRole('button', { name: 'Edit NPC A', exact: true }).click();
    }
    await a.getByRole('dialog').getByLabel('Occupation', { exact: true }).fill('Version A');
    await b.getByRole('dialog').getByLabel('Occupation', { exact: true }).fill('Version B');
    await a.getByRole('button', { name: 'Save NPC', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Save status: Saved', exact: true })).toBeVisible();
    await b.getByRole('button', { name: 'Save NPC', exact: true }).click();
    await b.getByRole('button', { name: 'Save status: Needs review', exact: true }).click();
    await expect(b.getByLabel('Shared version', { exact: true })).toHaveValue('Version A');
    await expect(b.getByLabel('Your version', { exact: true })).toHaveValue('Version B');
    for (const width of [390, 320]) {
      await b.setViewportSize({ width, height: 844 });
      const dialog = b.getByRole('dialog');
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await b.screenshot({ path: testInfo.outputPath(`conflict-${width}.png`) });
    }
    await b.keyboard.press('Escape');
    await expect(b.getByRole('dialog')).not.toBeVisible();
    await expect(b.getByRole('button', { name: 'Save status: Needs review', exact: true })).toBeFocused();
    await b.getByRole('button', { name: 'Save status: Needs review', exact: true }).click();
    await b.getByRole('button', { name: 'Apply my changes', exact: true }).click();
    await expect.poll(async () => (await getDoc(doc(env.unauthenticatedContext().firestore(), 'games', id))).data()?.steading.residents[0].occupation).toBe('Version B');
  } finally { await Promise.all(contexts.map((context) => context.close())); }
});

test('a form survives reload and editing a deleted NPC stays recoverable', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4175' });
  try {
    await context.addInitScript((gameId) => localStorage.setItem('hearthfire:session-game-id', gameId), id);
    const page = await context.newPage();
    await page.goto('/game/steading#npcs');
    await page.getByRole('button', { name: 'Edit NPC A', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Occupation', { exact: true }).fill('Recover this form');
    await expect(page.getByRole('button', { name: 'Save NPC', exact: true })).toBeEnabled();
    await page.reload();
    await page.getByRole('button', { name: 'Edit NPC A', exact: true }).click();
    await page.getByRole('button', { name: 'Restore draft: NPC A', exact: true }).click();
    await expect(page.getByRole('dialog').getByLabel('Occupation', { exact: true })).toHaveValue('Recover this form');
    await env.withSecurityRulesDisabled(async (ctx) => {
      const ref = doc(ctx.firestore(), 'games', id);
      const game = (await getDoc(ref)).data()!;
      await setDoc(ref, { ...game, steading: { ...game.steading, residents: game.steading.residents.filter((npc: { id: string }) => npc.id !== 'npc-a') } });
    });
    await expect.poll(() => page.evaluate(() => window.hearthfireQA.state().game?.steading?.residents?.length)).toBe(1);
    await page.getByRole('button', { name: 'Save NPC', exact: true }).click();
    await page.getByRole('button', { name: 'Save status: Needs review', exact: true }).click();
    await expect(page.getByLabel('Your version', { exact: true })).toHaveValue('Recover this form');
    await expect(page.getByRole('button', { name: 'Apply my changes', exact: true })).toBeDisabled();
    expect((await getDoc(doc(env.unauthenticatedContext().firestore(), 'games', id))).data()?.steading.residents).toHaveLength(1);
  } finally { await context.close(); }
});

test('same-browser tabs share remembered access and durable changes', async ({ context }) => {
  await context.addInitScript((gameId) => localStorage.setItem('hearthfire:session-game-id', gameId), id);
  const first = await context.newPage();
  await first.goto('/game/heavy#inventory');
  const second = await context.newPage();
  await second.goto('/game/heavy#inventory');
  await first.getByLabel('Other things', { exact: true }).fill('Shared between tabs');
  await expect(second.getByLabel('Other things', { exact: true })).toHaveValue('Shared between tabs');
  await expect.poll(async () => (await getDoc(doc(env.unauthenticatedContext().firestore(), 'games', id))).data()?.characters[0].data.inventoryOtherThings).toBe('Shared between tabs');
  await first.goto('/');
  await first.getByRole('button', { name: 'Forget this device', exact: true }).click();
  await expect(second).toHaveURL('http://127.0.0.1:4175/');
});

test('the stored light theme applies on a direct Home reload', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hearthfire-color-scheme', 'light'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('notes can be edited again after the previous hold releases', async ({ page }) => {
  await page.addInitScript((gameId) => localStorage.setItem('hearthfire:session-game-id', gameId), id);
  await page.goto('/game/heavy#inventory');
  const notes = page.getByRole('textbox', { name: 'Notes', exact: true });
  await notes.fill('First editing session');
  const stored = () => getDoc(doc(env.unauthenticatedContext().firestore(), 'games', id));
  await expect.poll(async () => (await stored()).data()?.notes?.['pc-a']).toContain('First editing session');
  await expect.poll(async () => (await stored()).data()?.notesLocks?.['pc-a'], { timeout: 15_000 }).toBeNull();
  await notes.fill('Next editing session');
  await expect.poll(async () => (await stored()).data()?.notes?.['pc-a']).toContain('Next editing session');
  await expect(page.getByRole('button', { name: 'Save status: Needs review', exact: true })).not.toBeVisible();
});

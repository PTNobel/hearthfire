import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = 'return false; // HEARTHFIRE_SESSION_ID';

// Render the session ID into Firestore server-side rules, not the Vite bundle.
export function renderRules(template, sessionId) {
  if (typeof sessionId !== 'string' || !/^[a-z0-9][a-z0-9_-]{15,127}$/.test(sessionId)) {
    throw new Error('HEARTHFIRE_SESSION_ID must be 16–128 lowercase letters, digits, hyphens or underscores, beginning with a letter or digit.');
  }
  if (template.split(MARKER).length !== 2) {
    throw new Error('Expected exactly one session-ID marker in firestore.rules.');
  }
  return template.replace(MARKER, 'return id == ' + JSON.stringify(sessionId) + ';');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const template = readFileSync(resolve(root, 'firestore.rules'), 'utf8');
  const compiled = renderRules(template, process.env.HEARTHFIRE_SESSION_ID);
  mkdirSync(resolve(root, '.firebase'), { recursive: true });
  writeFileSync(resolve(root, '.firebase', 'firestore.rules'), compiled, { mode: 0o600 });
  console.log('Private Firestore rules generated.');
}

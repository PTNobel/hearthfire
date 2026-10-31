import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderRules } from './render-firestore-rules.mjs';

const template = 'function isAllowedSession(id) { return false; // HEARTHFIRE_SESSION_ID\n}';

test('substitutes the session ID into server-side rules', () => {
  const rules = renderRules(template, 'b1d3c5e7a9f1234567890abcde');
  assert.match(rules, /return id == "b1d3c5e7a9f1234567890abcde";/);
  assert.doesNotMatch(rules, /HEARTHFIRE_SESSION_ID/);
});

test('rejects missing, weak or unsafe session IDs', () => {
  for (const id of [undefined, '', 'short', 'My-Game-Session-Id', 'a/bad-session-id-12345', 'bad session id 1234567']) {
    assert.throws(() => renderRules(template, id), /HEARTHFIRE_SESSION_ID/);
  }
});

test('rejects rules templates with absent or duplicate markers', () => {
  assert.throws(() => renderRules('allow get: if true;', 'abcdef0123456789'), /exactly one/);
  assert.throws(() => renderRules(template + template, 'abcdef0123456789'), /exactly one/);
});

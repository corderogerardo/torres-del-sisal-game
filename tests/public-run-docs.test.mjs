import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const docs = await readFile(new URL('../SUPABASE_RUN_RECORDS.md', import.meta.url), 'utf8').catch(() => '');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/202609230001_public_run_records.sql', import.meta.url), 'utf8');

function assertDocsMatch(pattern, description) {
  assert.ok(pattern.test(docs), description);
}

test('setup guide explains safe local config, anonymous auth, and the migration', () => {
  assertDocsMatch(/public\/supabase-config\.example\.js/, 'guide must identify the local config template');
  assertDocsMatch(/publishable key/i, 'guide must use a browser-safe publishable key');
  assertDocsMatch(/service[_ -]?role|secret key/i, 'guide must prohibit browser secrets');
  assertDocsMatch(/anonymous sign-?ins/i, 'guide must explain enabling anonymous Auth');
  assertDocsMatch(/persistSession:\s*false/, 'guide must document session-only auth');
  assertDocsMatch(/202609230001_public_run_records\.sql/, 'guide must identify the local migration');
  assertDocsMatch(/supabase link --project-ref/, 'guide must explain how to link the intended project');
  assertDocsMatch(/supabase db push --dry-run/, 'guide must instruct a migration dry run');
  assertDocsMatch(/supabase db push/, 'guide must instruct how to apply the migration');
  assertDocsMatch(/was applied .*Supabase CLI/i, 'guide must record the completed CLI migration');
  assert.match(readme, /SUPABASE_RUN_RECORDS\.md/);
});

test('privacy guide documents IP-free game tables and provider-side log caveat', () => {
  assertDocsMatch(/migration contains no `ip_address`/i, 'guide must state that game-owned tables have no IP field');
  assertDocsMatch(/provider.*may process.*IP|may process.*IP.*provider/i, 'guide must disclose provider-side IP processing');
  assertDocsMatch(/Auth audit logs/i, 'guide must identify Auth audit logs');
  assertDocsMatch(/retention/i, 'guide must explain retention depends on provider configuration/plan');
  assert.ok(!/\b(?:ip_address|user_agent|device_id)\b/i.test(migration), 'game-owned migration must not define IP, agent, or device fields');
});

test('product guide describes session counts, in-progress outcomes, and unverified rescues', () => {
  assertDocsMatch(/sessions, not people/i, 'guide must avoid claiming unique people');
  assertDocsMatch(/in_progress/i, 'guide must define unresolved runs');
  assertDocsMatch(/forced ascension/i, 'guide must distinguish ascension from a terminal loss');
  assertDocsMatch(/unverified/i, 'guide must label client-reported scores unverified');
  assertDocsMatch(/delete_my_run_data/i, 'guide must document current-session deletion');
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const docs = await readFile(new URL('../SUPABASE_RUN_RECORDS.md', import.meta.url), 'utf8').catch(() => '');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/202610200001_identity_free_run_telemetry.sql', import.meta.url), 'utf8').catch(() => '');

function assertDocsMatch(pattern, description) {
  assert.ok(pattern.test(docs), description);
}

test('setup guide explains safe local config, identity-free telemetry, and migration order', () => {
  assertDocsMatch(/public\/supabase-config\.example\.js/, 'guide must identify the local config template');
  assertDocsMatch(/publishable key/i, 'guide must use a browser-safe publishable key');
  assertDocsMatch(/service[_ -]?role|secret key/i, 'guide must prohibit browser secrets');
  assertDocsMatch(/202609230001_public_run_records\.sql/, 'guide must identify the local migration');
  assertDocsMatch(/202610200001_identity_free_run_telemetry\.sql/, 'guide must identify the identity-free migration');
  assertDocsMatch(/supabase link --project-ref/, 'guide must explain how to link the intended project');
  assertDocsMatch(/supabase db push --dry-run/, 'guide must instruct a migration dry run');
  assertDocsMatch(/supabase db push/, 'guide must instruct how to apply the migration');
  assertDocsMatch(/was applied .*Supabase CLI/i, 'guide must record the completed CLI migration');
  assertDocsMatch(/no Auth user|without.*Auth/i, 'guide must state that run telemetry does not create Auth users');
  assert.match(readme, /SUPABASE_RUN_RECORDS\.md/);
});

test('privacy guide documents identifier-free game rows and provider-side log caveat', () => {
  assertDocsMatch(/no username or player ID/i, 'guide must state that runs are not linked to a player');
  assertDocsMatch(/cannot read individual run rows, update or delete them|no individual player deletion/i, 'guide must explain aggregate-only access and no player deletion');
  assertDocsMatch(/provider.*may process.*IP|may process.*IP.*provider/i, 'guide must disclose provider-side IP processing');
  assertDocsMatch(/Auth audit logs/i, 'guide must identify Auth audit logs');
  assertDocsMatch(/retention/i, 'guide must explain retention depends on provider configuration/plan');
  assert.ok(!/\b(?:user_id|display_alias|ip_address|user_agent|device_id)\b/i.test(migration), 'telemetry migration must not define player, IP, agent, or device fields');
});

test('product guide describes run counts, durations, and unverified outcomes', () => {
  assertDocsMatch(/not unique people/i, 'guide must avoid claiming unique people');
  assertDocsMatch(/in_progress/i, 'guide must define unresolved runs');
  assertDocsMatch(/forced ascension/i, 'guide must distinguish ascension from a terminal loss');
  assertDocsMatch(/unverified/i, 'guide must label client-reported scores unverified');
  assertDocsMatch(/average|percentile|duration/i, 'guide must explain the run-duration aggregates');
  assertDocsMatch(/no individual player deletion|cannot.*delete individual/i, 'guide must not promise player-controlled deletion');
});

test('guide documents default-on aggregate telemetry, durable queue, and local migration', () => {
  assertDocsMatch(/default-on/i, 'guide must disclose that run telemetry is enabled by default');
  assertDocsMatch(/opt-out/i, 'guide must explain how to disable future telemetry');
  assertDocsMatch(/IndexedDB/i, 'guide must explain durable local retry storage');
  assertDocsMatch(/202610200001_identity_free_run_telemetry\.sql/, 'guide must identify the new local migration');
  assertDocsMatch(/fully paused|project.*paused/i, 'guide must state that a fully paused project requires owner restore');
  assertDocsMatch(/aggregate/i, 'guide must describe aggregate output rather than player records');
  assertDocsMatch(/no remote|local only|have not been applied remotely|has not been applied/i, 'guide must disclose the local-only migration state');
  assert.doesNotMatch(docs, /anonymous Auth (?:session is created|is required|is used)|display alias|delete_my_run_data/i);
  assert.doesNotMatch(readme, /opt-in, session-only Supabase records adapter/i);
  assert.doesNotMatch(readme, /public rescue aliases remain separately opt-in/i);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/202610150001_run_record_upsert.sql', import.meta.url),
  'utf8',
).catch(() => '');

test('historical upsert migration preflights global run identity before indexing', () => {
  assert.match(migration, /duplicate preflight/i, 'migration must clearly identify its duplicate preflight');
  assert.match(migration, /if exists\s*\([\s\S]*group by\s+r\.client_run_id[\s\S]*having count\(\*\) > 1/i, 'migration must detect duplicate client run IDs');
  assert.match(migration, /raise exception[^;]*(?:duplicate|client_run_id)/i, 'migration must fail closed with a clear duplicate error');
  assert.match(migration, /create unique index[^;]*run_records_client_run_id[^;]*on public\.run_records\s*\(client_run_id\)/i, 'client run IDs must be globally unique');
});

test('historical upsert migration validates its owner-authenticated submission contract', () => {
  assert.match(migration, /function public\.submit_run_record\s*\(\s*p_client_run_id uuid,\s*p_difficulty text,\s*p_outcome text,\s*p_duration_ms bigint,\s*p_floor_reached smallint,\s*p_mementos smallint,\s*p_display_alias text default null,\s*p_publish_rescue boolean default false\s*\)\s*returns uuid/i, 'RPC must expose the agreed parameter and return contract');
  assert.match(migration, /security definer\s+set search_path\s*=\s*''/i, 'RPC must be a security definer with an empty search path');
  assert.match(migration, /auth\.uid\(\)/i, 'RPC must derive its caller from auth.uid()');
  assert.match(migration, /from public\.player_preferences[^;]*stats_opt_in[^;]*rescue_opt_in/i, 'RPC must require an existing opted-in preferences row');
  assert.match(migration, /p_difficulty not in\s*\('Piadoso',\s*'Normal',\s*'Pesadilla'\)/i, 'RPC must validate the game difficulty set');
  assert.match(migration, /p_outcome not in\s*\('in_progress',\s*'rescued',\s*'jumped'\)/i, 'RPC must validate the lifecycle outcomes');
  assert.match(migration, /p_outcome = 'in_progress'[\s\S]*p_duration_ms is not null/i, 'in-progress payloads must require null duration');
  assert.match(migration, /p_duration_ms not between 1000 and 7200000/i, 'terminal durations must be bounded');
  assert.match(migration, /p_floor_reached is null or p_floor_reached not between 1 and 7/i, 'reported floors must be bounded');
  assert.match(migration, /p_mementos is null or p_mementos not between 0 and 6/i, 'reported mementos must be bounded');
  assert.match(migration, /revoke all on function public\.submit_run_record\([^;]*\)\s+from public, anon, authenticated/i, 'RPC execution defaults must be revoked');
  assert.match(migration, /grant execute on function public\.submit_run_record\([^;]*\)\s+to authenticated/i, 'only authenticated callers may execute the RPC');
});

test('historical upsert migration serializes retries and preserves terminal outcomes', () => {
  assert.match(migration, /on conflict\s*\(client_run_id\)\s*do nothing/i, 'concurrent inserts must not fail on a duplicate run ID');
  assert.match(migration, /select[^;]*from public\.run_records[^;]*where r\.client_run_id\s*=\s*p_client_run_id[^;]*for update/i, 'existing rows must be locked before replay handling');
  assert.match(migration, /if\s+v_run\.outcome\s*=\s*'in_progress'[\s\S]*update public\.run_records/i, 'an in-progress row may be transitioned to a terminal outcome');
  assert.match(migration, /v_run\.difficulty\s+is distinct from\s+p_difficulty/i, 'replays must match the original difficulty');
  assert.doesNotMatch(migration, /if\s+v_run\.user_id\s+is distinct from\s+v_user_id/i, 'session-only auth refresh must not block outbox replay for the same private run UUID');
  assert.match(migration, /client_run_id is the outbox capability for a single run/i, 'cross-session replay must be documented as a run-UUID capability');
  assert.match(migration, /update public\.run_records\s+set\s+outcome\s*=\s*p_outcome,\s*duration_ms\s*=\s*p_duration_ms,\s*floor_reached\s*=\s*p_floor_reached,\s*mementos\s*=\s*p_mementos\s+where id\s*=\s*v_run\.id/i, 'terminal transition must preserve the existing run identity and start fields');
  assert.match(migration, /if\s+v_run\.outcome\s+in\s*\('rescued',\s*'jumped'\)[\s\S]*p_outcome\s*=\s*v_run\.outcome[\s\S]*p_duration_ms\s*=\s*v_run\.duration_ms[\s\S]*p_floor_reached\s*=\s*v_run\.floor_reached[\s\S]*p_mementos\s*=\s*v_run\.mementos/i, 'exact terminal replays must be accepted without mutation');
  assert.match(migration, /raise exception[^;]*(?:conflict|payload|terminal)/i, 'conflicting terminal payloads must be rejected');
  assert.match(migration, /return v_run\.id/i, 'replays must return the original run row UUID');
  assert.match(migration, /terminal run requires a recorded in_progress start/i, 'terminal outcomes must not create runs without a durable start event');
});

test('historical upsert migration keeps its optional owner-bound rescue publication path', () => {
  assert.match(migration, /v_display_alias\s*:=\s*pg_catalog\.btrim\(p_display_alias\)[\s\S]*p_outcome\s*=\s*'rescued'[\s\S]*p_publish_rescue[\s\S]*v_display_alias is not null/i, 'public rescue publishing must require a rescued run, explicit choice, and valid alias');
  assert.match(migration, /rescue_opt_in/i, 'public rescue publishing must check current rescue consent');
  assert.match(migration, /insert into public\.public_rescue_entries[\s\S]*owner_id[\s\S]*v_run\.user_id/i, 'public entry owner must come from the existing run row');
  assert.match(migration, /on conflict\s*\(run_record_id\)\s*do nothing/i, 'duplicate public rescue entries must be harmless');
  assert.doesNotMatch(migration, /create\s+or\s+replace\s+function\s+public\.get_public_rescues/i, 'the existing public rescue allowlist must not be replaced');
  assert.doesNotMatch(migration, /\b(?:ip_address|user_agent|email|device_id|device_fingerprint)\b/i, 'telemetry must not add identifying device or network fields');
  assert.doesNotMatch(migration, /\b(?:alter|drop)\s+table\s+public\.(?:player_preferences|run_records|public_rescue_entries)\b/i, 'the migration must not change existing table RLS or grants');
  assert.doesNotMatch(migration, /\b(?:create|drop)\s+policy\b/i, 'the migration must leave existing RLS policies intact');
  assert.doesNotMatch(migration, /\b(?:grant|revoke)\b[^;]*\bon\s+table\b/i, 'the migration must not change existing table grants');
  assert.doesNotMatch(migration, /\bservice_role\b/i, 'the RPC must not grant service-role access');
});

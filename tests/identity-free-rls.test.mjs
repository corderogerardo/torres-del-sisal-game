import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/202610200001_identity_free_run_telemetry.sql', import.meta.url),
  'utf8',
).catch(() => '');

test('browser roles cannot read, update, or delete individual telemetry rows', () => {
  assert.match(migration, /alter table public\.game_run_telemetry enable row level security/i);
  assert.match(migration, /revoke all on table public\.game_run_telemetry from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /create policy[^;]*on public\.game_run_telemetry/i);
  assert.doesNotMatch(migration, /grant\s+(?:select|update|delete)[^;]*on\s+table\s+public\.game_run_telemetry/i);
  assert.match(migration, /function public\.get_run_telemetry_aggregates\(\)/i);
  assert.match(migration, /grant execute on function public\.get_run_telemetry_aggregates\(\) to anon, authenticated/i);
});

test('run submission is anonymous, validated, idempotent, and has no user identity fields', () => {
  assert.match(migration, /create table public\.game_run_telemetry\s*\([\s\S]*client_run_id uuid primary key/i);
  assert.doesNotMatch(migration, /\b(?:user_id|display_alias|username|email|ip_address|user_agent|device_fingerprint)\b/i);
  assert.match(migration, /function public\.submit_game_run_telemetry\s*\([\s\S]*p_client_run_id uuid,[\s\S]*p_difficulty text,[\s\S]*p_outcome text/i);
  assert.match(migration, /security definer\s+set search_path\s*=\s*''/i);
  assert.doesNotMatch(migration, /auth\.uid\(\)/i);
  assert.match(migration, /on conflict \(client_run_id\) do nothing/i);
  assert.match(migration, /terminal run requires a recorded in_progress start/i);
  assert.match(migration, /conflicting terminal run payload/i);
  assert.match(migration, /grant execute on function public\.submit_game_run_telemetry\([^;]+\)\s+to anon, authenticated/i);
  assert.doesNotMatch(migration, /\bservice_role\b/i);
});

test('aggregate RPC exposes counts and run-duration summaries without raw rows', () => {
  assert.match(migration, /returns table\s*\([\s\S]*started_count bigint[\s\S]*rescued_count bigint[\s\S]*jumped_count bigint/i);
  assert.match(migration, /average_duration_ms bigint/i);
  assert.match(migration, /p50_duration_ms bigint/i);
  assert.match(migration, /p95_duration_ms bigint/i);
  assert.match(migration, /count\(\*\) filter \(where outcome = 'rescued'\)/i);
  assert.match(migration, /percentile_cont\(0\.95\)/i);
});

test('legacy player deletion and public alias endpoints are revoked without deleting historical rows', () => {
  assert.match(migration, /revoke all on table\s+public\.player_preferences,\s+public\.run_records,\s+public\.public_rescue_entries\s+from public, anon, authenticated/i);
  assert.match(migration, /drop policy if exists player_preferences_owner_all on public\.player_preferences/i);
  assert.match(migration, /drop policy if exists run_records_owner_delete on public\.run_records/i);
  assert.match(migration, /drop policy if exists public_rescue_owner_delete on public\.public_rescue_entries/i);
  assert.match(migration, /revoke all on function public\.delete_my_run_data\(\) from public, anon, authenticated/i);
  assert.match(migration, /drop function if exists public\.delete_my_run_data\(\)/i);
  assert.match(migration, /revoke all on function public\.get_public_rescues\(\) from public, anon, authenticated/i);
  assert.match(migration, /drop function if exists public\.get_public_rescues\(\)/i);
  assert.doesNotMatch(migration, /drop\s+table/i);
});

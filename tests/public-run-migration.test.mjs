import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/202609230001_public_run_records.sql', import.meta.url),
  'utf8',
).catch(() => '');

function assertMigrationMatches(pattern, description) {
  assert.ok(pattern.test(migration), description);
}

test('run records enforce owner-scoped RLS and bounded gameplay values', () => {
  for (const table of ['player_preferences', 'run_records', 'public_rescue_entries']) {
    assertMigrationMatches(
      new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
      `${table} must enable RLS`,
    );
    assertMigrationMatches(
      new RegExp(`create policy [\\w_]+\\s+on public\\.${table}`, 'i'),
      `${table} must have an explicit owner policy`,
    );
  }

  assertMigrationMatches(/user_id\s+uuid\s+primary key\s+references auth\.users\s*\(id\) on delete cascade/i, 'preferences must be bound to the auth owner');
  assertMigrationMatches(/auth\.uid\(\)/i, 'owner policies must derive identity from auth.uid()');
  assertMigrationMatches(/unique\s*\(user_id, client_run_id\)/i, 'a client run can be submitted only once per owner');
  assertMigrationMatches(/difficulty in\s*\('Piadoso',\s*'Normal',\s*'Pesadilla'\)/i, 'difficulty values must match the game');
  assertMigrationMatches(/outcome in\s*\('in_progress',\s*'rescued',\s*'jumped'\)/i, 'outcome values must match the data contract');
  assertMigrationMatches(/duration_ms between 1000 and 7200000/i, 'terminal durations must be bounded');
  assertMigrationMatches(/duration_ms is not null and duration_ms between 1000 and 7200000/i, 'terminal duration must be present');
  assertMigrationMatches(/floor_reached between 1 and 7/i, 'reported floors must be bounded');
  assertMigrationMatches(/mementos between 0 and 6/i, 'reported mementos must be bounded');
  assertMigrationMatches(/char_length\(display_alias\) between 1 and 24/i, 'aliases must be bounded');
  assertMigrationMatches(/old\.outcome <> 'in_progress'/i, 'terminal run outcomes must be immutable');
  assertMigrationMatches(/new\.outcome not in \('rescued', 'jumped'\)/i, 'runs may only transition from in-progress to a terminal outcome');
  assertMigrationMatches(/new\.ended_at\s*:=\s*clock_timestamp\(\)/i, 'terminal timestamps must come from the database clock');
  assertMigrationMatches(/before insert or update on public\.run_records/i, 'database timestamp guard must cover terminal inserts and updates');
});

test('public APIs return only aggregate counts and opted-in rescued-run fields', () => {
  assertMigrationMatches(/function public\.get_run_analytics\(\)/i, 'aggregate RPC must exist');
  assertMigrationMatches(/started_count/i, 'aggregate must count starts');
  assertMigrationMatches(/in_progress_count/i, 'aggregate must count unresolved runs');
  assertMigrationMatches(/rescued_count/i, 'aggregate must count rescues');
  assertMigrationMatches(/jumped_count/i, 'aggregate must count jumps');
  assertMigrationMatches(/session_count/i, 'aggregate must count opted-in anonymous sessions');
  assertMigrationMatches(/where p\.stats_opt_in/i, 'aggregate must exclude sessions without statistics consent');
  assertMigrationMatches(/function public\.get_public_rescues\(\)/i, 'public leaderboard RPC must exist');
  assertMigrationMatches(/returns table\s*\(\s*display_alias text,\s*difficulty text,\s*duration_ms bigint,\s*mementos smallint,\s*created_at timestamptz\s*\)/i, 'leaderboard must return only allowlisted fields');
  assertMigrationMatches(/where p\.rescue_opt_in and r\.outcome = 'rescued'/i, 'leaderboard must include only opted-in rescued runs');
  assert.ok(!/returns table\s*\([^)]*\b(?:user_id|email|ip_address|device_id|timeline|history)\b/is.test(migration), 'public RPCs must not return private identifiers or histories');
  assertMigrationMatches(/security definer\s+set search_path = ''/i, 'definer functions must use a fixed empty search path');
});

test('public grants stay narrow and owners can delete their session-bound data', () => {
  assertMigrationMatches(/revoke all on table\s+public\.player_preferences,\s+public\.run_records,\s+public\.public_rescue_entries\s+from public, anon, authenticated/i, 'table defaults must be revoked before least-privilege grants');
  assertMigrationMatches(/revoke all on function public\.get_run_analytics\(\) from public/i, 'aggregate function default grants must be revoked');
  assertMigrationMatches(/grant execute on function public\.get_run_analytics\(\) to anon, authenticated/i, 'only public roles should call aggregate RPC');
  assertMigrationMatches(/revoke all on function public\.get_public_rescues\(\) from public/i, 'leaderboard function default grants must be revoked');
  assertMigrationMatches(/grant execute on function public\.get_public_rescues\(\) to anon, authenticated/i, 'public roles should call leaderboard RPC');
  assertMigrationMatches(/function public\.delete_my_run_data\(\)/i, 'owner deletion function must exist');
  assertMigrationMatches(/current_user_id uuid := \(select auth\.uid\(\)\)/i, 'deletion must bind to the current auth owner');
  assertMigrationMatches(/delete from public\.run_records where user_id = current_user_id/i, 'deletion must remove only the current owner records');
  assertMigrationMatches(/create index[^;]+run_records_user_id_idx/i, 'owner foreign key must be indexed');
  assertMigrationMatches(/create index[^;]+public_rescue_entries_leaderboard_idx/i, 'leaderboard filter and ordering must be indexed');
});

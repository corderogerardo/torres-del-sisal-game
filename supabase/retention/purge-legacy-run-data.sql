-- Manual legacy run-data purge. NOT a migration.
--
-- This script permanently deletes the historical identity-linked rows created by
-- supabase/migrations/202609230001_public_run_records.sql:
--   public.public_rescue_entries
--   public.run_records
--   public.player_preferences
--
-- It does not touch public.game_run_telemetry (the shipped identity-free
-- telemetry table), it never drops a table, and it never deletes Auth users.
--
-- IRREVERSIBLE and NOT AUTOMATIC:
--   * No migration, scheduled job, or application code runs this file. It lives
--     outside supabase/migrations/, so `supabase db push` never applies it.
--   * Deletion cannot be undone and requires explicit owner authorization.
--     Decide the backup/restore position before running it.
--   * By default the rows are retained indefinitely; there is no automatic
--     expiry and no user-facing erasure control. Browser roles (anon,
--     authenticated) cannot reach these tables.
--
-- Run it by hand, as a database owner/admin role, in the project's SQL editor or
-- through an already-authenticated CLI session. Do not store credentials,
-- project refs, or connection strings in this repository.

-- Step 1 — read-only inspection. Shows what the purge would delete; no writes.
select
  (select count(*) from public.public_rescue_entries) as public_rescue_entries_rows,
  (select count(*) from public.run_records) as run_records_rows,
  (select count(*) from public.player_preferences) as player_preferences_rows;

-- Step 2 — destructive. Foreign-key-safe order, single transaction.
-- public_rescue_entries references public.run_records (id, user_id), so it must
-- be cleared first. public.player_preferences has no dependent table.
begin;

-- Historical rescue-leaderboard rows.
delete from public.public_rescue_entries;

-- Historical owner-scoped run rows.
delete from public.run_records;

-- Historical preference and opt-in rows.
delete from public.player_preferences;

commit;

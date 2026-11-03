-- Retire the legacy aggregate RPC.
--
-- public.get_run_analytics() is security definer over the historical
-- owner-scoped tables: it joins public.run_records to public.player_preferences
-- on user_id. The shipped analytics path is public.get_run_telemetry_aggregates(),
-- which reads the identity-free public.game_run_telemetry table, so this
-- endpoint only keeps a browser-reachable window onto legacy identity-linked
-- data.
--
-- Historical rows are retained; this migration removes the callable surface
-- only. Grants are revoked explicitly before removal, mirroring
-- 202610200001_identity_free_run_telemetry.sql. A migration file is applied as
-- one transaction, so a failed drop rolls the revoke back with it.
revoke all on function public.get_run_analytics() from public, anon, authenticated;

drop function if exists public.get_run_analytics();

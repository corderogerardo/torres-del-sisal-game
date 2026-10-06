# Public Run Records and Game Analytics

## Objective

Add opt-in, pseudonymous Supabase-backed game-run records for the static Three.js game. Show a public best-rescue leaderboard and aggregate play/outcome counts while keeping individual run histories private.

## Problem and Why

The game currently tracks only local gameplay state and optional local renderer metrics. The owner wants fastest rescued runs by difficulty, play counts, wins/failures, and useful balancing data. Public run history and real names would expose player behavior; client-only scores can also be forged.

## Approved Product/Privacy Model

- User approved: optional pseudonyms; public best rescued runs and aggregate counts; private full run histories.
- User chose a session-only anonymous identity: no auth/session token persists in browser storage. Counts are anonymous sessions, not unique people; the leaderboard ranks opted-in runs, not a durable best-per-person across visits.
- No IP, user-agent, email, location, device fingerprint, or mental-health fields in game-owned tables or application logs. Supabase provider-side Auth/API logs may process connection metadata; disclose this caveat to players and in setup docs.
- Game remains playable without network access or Supabase configuration.
- Separate opt-in for anonymous gameplay statistics and for publishing a display alias/best run. Both default off.
- Define outcomes as `rescued`, `jumped`, and `in_progress`; a forced ascension is not a failed run. Do not describe client-submitted records as verified or anti-cheat protected.
- Public counts are counts of consented, recorded runs and anonymous Auth sessions, not exact counts of real people. Failed/offline submissions are not counted.
- The agent may create local migration/client/UI artifacts only. Do not contact, create, inspect, or modify a live Supabase project, deploy functions, or use credentials until the user authorizes a specific project/destination and operation.
- Identity decision resolved: session-only anonymous Auth with `persistSession: false`; losing the page session means no returning-player linkage or retrieval of private prior history.

## Scope and Constraints

- Preserve the no-build, static Three.js architecture and all existing game behavior.
- Keep integration optional and non-blocking; never let Auth or database errors stop a run.
- Use Supabase anonymous Auth and RLS for owner-bound private records. Keep the service-role key server-side; it must never appear in browser code.
- Public reads may expose only allowlisted display alias, difficulty, rescued duration, mementos, and aggregate counts. Full run rows remain owner-only.
- Rate/shape checks reduce abuse but do not make client-only scores trustworthy. Label leaderboard results community-reported/unverified.
- No public individual `jumped` history; only aggregate outcome counts.
- No new analytics vendor or server-side game account requirement.
- TDD is enabled. Primary checks use Node's built-in runner (`node --test tests/*.test.mjs`); browser regression is `/?test` and the new leaderboard/opt-in flow in Playwright.
- Delivery strategy: `ask-on-risk`; forecast approximately 600 authored lines across 4 work units. No commit/push/PR is authorized unless the user explicitly asks; ask for chain strategy before any future commit if the forecast still exceeds the advisory 400-line threshold.

## Tasks

- [x] ODD-1 — Add a Supabase migration for anonymous player preferences, private run history, public best-rescue entries, aggregate counts, constraints, indexes, RLS, and narrowly scoped database functions.
- [x] ODD-2 — Add opt-in local Supabase configuration and a lazy-loaded client/data adapter; no network/auth work before explicit user opt-in and valid config.
- [x] ODD-3 — Record run start/end best-effort without blocking gameplay; offer alias publication, render public best rescued runs per difficulty, and show aggregate counts. Use text-safe rendering and graceful offline states.
- [x] ODD-4 — Add tests/docs for outcomes, opt-in/privacy behavior, public field allowlist, local setup, RLS/migration checks, and honest score-verification limits.

## Acceptance Criteria

- With no Supabase config, no SDK download or request occurs and the game remains fully playable.
- With config but no opt-in, no Auth or data requests occur.
- Anonymous opt-in can record a run; end outcomes and durations are validated and failures are non-blocking.
- An alias and rescued run become public only after separate explicit opt-in; full run history stays owner-only. The active session can delete its private rows/public entry; no durable identity is retained for later visits.
- Public output contains no email, auth UUID, raw run timeline, IP, device, or jumped ending row.
- Public counts clearly mean recorded opt-in activity/anonymous sessions, not actual people; leaderboard entries are labelled unverified.
- Tests verify the behavior and fail first under TDD. Browser `/?test` remains green.
- Deployment instructions explain how the owner can create/configure a Supabase project and apply the migration, without exposing credentials in this repository.

## Progress and Evidence

- Branch: `feature/architecture-fitness-support`; existing architecture/support changes are already uncommitted and must be preserved.
- Pre-existing untracked `.atl/` remains user data and must not be touched.
- Supabase project reference `qsinbieznomavmrnoxeg` and explicit authorization to use the current Supabase CLI session were supplied. No URL/publishable key is configured in the game; no secret was added to the repository or browser.
- Current `?metrics` remains local renderer/frame diagnostics, separate from player records.
- ODD-1 evidence: `tests/public-run-migration.test.mjs` failed first on missing RLS/migration behavior; after the migration, `node --test tests/*.test.mjs` passed 12/12. `psql` is unavailable, so SQL was not applied or parsed against a local PostgreSQL instance.
- ODD-2 evidence: `tests/run-records-client.test.mjs` failed first on the absent data adapter; after implementation, the focused suite passed 16/16. It covers consent upserts, owner-private in-progress/terminal records, duplicate submission prevention, rescue-only public insertion, aggregate/leaderboard allowlisting, non-throwing provider failures, and current-session deletion. The pinned CDN and remote Auth/API endpoints were not contacted.
- ODD-3 evidence: `tests/run-session.test.mjs` first failed because the run-session API was missing, then passed 3/3; `tests/run-records-ui.test.mjs` first failed because the opt-ins/rendering/terminal wiring were absent, then passed 6/6. Coverage verifies monotonic duration, one terminal submission, forced ascension remaining nonterminal, separate default-off consent, safe text rendering, private jumped endings, and non-blocking rescued/jumped recording.
- ODD-4 evidence: `tests/public-run-docs.test.mjs` first failed because the setup/privacy guidance was absent, then passed 3/3. `node --test tests/*.test.mjs` passed 40/40. `node --check public/run-records.mjs`, inline HTML module syntax compilation, and `rtk git diff --check` passed.
- Resolved IP scope: game-owned tables and application logs contain no IP or user-agent fields. The UI and `SUPABASE_RUN_RECORDS.md` disclose that Supabase provider-side Auth/API logs may process IP/user-agent connection metadata and that retention depends on project settings/plan. Sources: https://supabase.com/docs/guides/auth/audit-logs and https://supabase.com/docs/guides/telemetry/logs
- Migration evidence: `supabase link --project-ref qsinbieznomavmrnoxeg` succeeded; `supabase db push --dry-run` listed only `202609230001_public_run_records.sql`; `supabase db push` applied that migration successfully. `psql` is unavailable, so there was no separate local PostgreSQL run. Live Auth/RLS behavior has not been exercised from the browser.
- Remote status: only the authorized schema migration was applied. No secret value was printed, inspected, or added to the repository/game. The Supabase CLI used the user's explicitly authorized local session; local credential storage was not inspected.
- Browser status: a local Playwright Chromium run of `/?test` passed the built-in harness **65/65** (render micro-benchmark 0.2 ms/frame). The intro showed both opt-ins unchecked and the Supabase feature disabled with the example config absent. Browser console reported only the pre-existing `/favicon.ico` 404. No Supabase Auth/API client request was made.
- Remaining work: owner must add `public/supabase-config.js` with the project URL and publishable key (it is gitignored), then explicitly test the opt-in/auth/data flow. This was not possible without the project's public client configuration.
- Commit identities: pending; no commit is authorized unless the user explicitly asks.

## Next Step

Local ODD-1 through ODD-4 are complete with the resolved IP scope: do not add IP/user-agent fields to game-owned tables or logs, and keep the Supabase provider-side logging caveat disclosed. Migration `202609230001_public_run_records.sql` is applied to project `qsinbieznomavmrnoxeg`; the browser integration remains disabled until local publishable configuration is provided.

# Public Run Records and Game Analytics

> **Historical record.** Session log kept for traceability, not a current plan. Reconciled 2026-11-03; see the Log for evidence. Shipped design: [`docs/architecture.md`](../../docs/architecture.md).

## Objective

Add pseudonymous Supabase-backed game-run records for the static Three.js game, enabled by default with an opt-out. Show a public best-rescue leaderboard and aggregate play/outcome counts while keeping individual run histories private.

## Problem and Why

The game currently tracks only local gameplay state and optional local renderer metrics. The owner wants fastest rescued runs by difficulty, play counts, wins/failures, and useful balancing data. Public run history and real names would expose player behavior; client-only scores can also be forged.

## Approved Product/Privacy Model

- User approved: optional pseudonyms; public best rescued runs and aggregate counts; private full run histories.
- User chose a session-only anonymous identity: no auth/session token persists in browser storage. Counts are anonymous sessions, not unique people; the leaderboard ranks opted-in runs, not a durable best-per-person across visits.
- No IP, user-agent, email, location, device fingerprint, or mental-health fields in game-owned tables or application logs. Supabase provider-side Auth/API logs may process connection metadata; disclose this caveat to players and in setup docs.
- Game remains playable without network access or Supabase configuration.
- Run telemetry is enabled by default with a persistent opt-out; publishing a display alias/best rescue remains a separate explicit opt-in.
- Define outcomes as `rescued`, `jumped`, and `in_progress`; a forced ascension is not a failed run. Do not describe client-submitted records as verified or anti-cheat protected.
- Public counts are counts of synchronized run records and anonymous Auth sessions, not unique people. Failed/offline submissions remain pending locally and are not counted until synchronized.
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
- [x] ODD-2 — Add local Supabase configuration and a lazy-loaded client/data adapter; run telemetry is enabled by default unless the player opts out, and public alias publication remains separately opt-in.
- [x] ODD-3 — Superseded and delivered by `odd/tasks/all-player-run-telemetry.md` (PR #2, squash `583de1d`): default-on, opt-out, identity-free run telemetry with a durable IndexedDB outbox. Alias publication and the player-facing leaderboard/deletion path were retired by the 2026-10-15 requirement change.
- [x] ODD-4 — Add tests/docs for outcomes, telemetry opt-out/privacy behavior, public field allowlist, local setup, RLS/migration checks, and honest score-verification limits.

## Acceptance Criteria

Delivered against the identity-free design in `odd/tasks/all-player-run-telemetry.md`. The earlier alias/leaderboard and player-deletion criteria were retired by the 2026-10-15 requirement change.

- With no Supabase config, no SDK download or request occurs and the game remains fully playable.
- With config and telemetry enabled (the default), run records are captured; a persisted opt-out prevents future telemetry submissions.
- Anonymous session records capture a run with no display name; outcomes and durations are validated, failures are non-blocking, and pending records survive in a durable IndexedDB outbox.
- No username, user ID, or Auth identity is stored. Alias publication and the player-facing delete path were removed; historical identity-linked rows are retained and unreachable by browser roles.
- Public output contains no email, auth UUID, raw run timeline, IP, device, or jumped ending row.
- Public counts mean recorded runs, not unique people.
- Tests verify the behavior; browser `/?test` remains green (65/65 in headless Chrome on build `83256bc`).
- Deployment instructions explain how to configure Supabase and apply the migration, without exposing credentials in this repository.

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
- Requirement change (2026-10-15), user verbatim: “I want to save every players run even if does not provide a name, I want this to work like observability works to have real players data”. User selected “Default on, opt-out (Recommended)”. The earlier default-off statistics setting is superseded; public alias publication stays opt-in. See `odd/tasks/all-player-run-telemetry.md` for the new implementation tasks and delivery strategy.
- ODD-3 reconciliation (2026-11-03): closed as superseded, not as literal completion. The shipped design is identity-free aggregate telemetry; the original opt-in alias, public leaderboard, and player-deletion criteria no longer describe the code. Evidence: 35/35 focused tests across `anonymous-run-telemetry`, `run-telemetry-client`, `run-outbox`, `identity-free-rls`, `public-run-migration`, and `public-run-docs`; full suite 203/203. Telemetry defaults on with `TELEMETRY_OPT_OUT_KEY`; `public/run-outbox.mjs` is a durable IndexedDB queue; `get_public_rescues` and `delete_my_run_data` are dropped.
- Engram mirror for this requirement update is pending because multiple project sessions are active; local task documents remain the current source of truth.
- Browser status: a local Playwright Chromium run of `/?test` passed the built-in harness **65/65** (render micro-benchmark 0.2 ms/frame). The intro showed both opt-ins unchecked and the Supabase feature disabled with the example config absent. Browser console reported only the pre-existing `/favicon.ico` 404. No Supabase Auth/API client request was made.
- Remaining work: owner must add `public/supabase-config.js` with the project URL and publishable key (it is gitignored), then explicitly test the opt-in/auth/data flow. This was not possible without the project's public client configuration.
- Commit identities: pending; no commit is authorized unless the user explicitly asks.

## Next Step

Reconciled 2026-11-03: ODD-1 through ODD-4 are closed. The identity-free telemetry design in `odd/tasks/all-player-run-telemetry.md` replaced the original opt-in alias/leaderboard flow. Its follow-ups are now resolved: the legacy `get_run_analytics()` RPC is revoked and dropped by `202611030001_retire_legacy_run_analytics.sql` (local until applied remotely), legacy-row retention is decided with a manual purge script, and `scripts/playthrough.mjs` covers the interaction-driven browser playthrough. Nothing here blocks further work.

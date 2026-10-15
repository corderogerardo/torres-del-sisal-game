# All-Player Run Telemetry

Objective: Persist every opted-in-by-default run summary without requiring a player name, and safely retry delivery. Branch: `feature/architecture-review-deepening`. Delivery: `stacked-to-main` (forecast ~650 authored changed lines). Runner: `node --test tests/*.test.mjs`.

## Specs

- S1 — User request: “I want to save every players run even if does not provide a name, I want this to work like observability works to have real players data”. Save the existing gameplay run data without requiring a display name. Acceptance: each enabled run can be recorded whether or not an alias is supplied; game remains playable when Supabase is unavailable.
- S2 — User choice: “Default on, opt-out (Recommended)” and selected description: “Collect pseudonymous run summaries by default; explain it clearly and provide a setting to disable it. Public name/leaderboard remains opt-in.” Acceptance: run telemetry defaults on, a player can persistently opt out, and public alias/leaderboard publication remains a separate explicit choice.
- S3 — Preserve the existing approved privacy boundary from `odd/tasks/public-run-leaderboard.md` and Engram #391: no IP, user-agent, email, location, device-fingerprint, or mental-health fields in game-owned tables/application logs; disclose provider-side Auth/API metadata processing; keep anonymous Auth tokens session-only (`persistSession: false`); no service-role key in browser code. Acceptance: tests and player/setup copy preserve these boundaries. “No name” is described as pseudonymous run telemetry, not guaranteed anonymity or unique-person measurement.
- S4 — Reliable delivery: queue opted-in run data durably in the browser before network submission; replay on eligible startup/online/visibility events; use stable run identity for idempotent server persistence; clear pending data only after server confirmation or explicit telemetry opt-out. A terminal retry must ensure its `in_progress` start is recorded first; the RPC rejects terminal-only inserts. Because anonymous Auth tokens remain session-only, replay may arrive under a new anonymous session; the RPC may finalize only the same globally unique in-progress client run ID, preserving owner, difficulty, and start identity. Exact duplicate terminal payloads are harmless; conflicting terminal payloads are rejected. If IndexedDB is unavailable, best-effort direct writes may run only when the start row is confirmed; never insert a terminal-only run. Acceptance: tests prove retry, replay, duplicate safety, opt-out queue removal, and non-blocking gameplay. A fully paused Supabase project remains unavailable until the owner restores it; do not contact or modify a live project in this task.
- Assumption: capture only the existing run summary and lifecycle (`in_progress`, `rescued`, `jumped`); do not add new behavioral, device, or identity fields.

## Tasks

- T1 — S4, route delegated-direct (parallel writer): IndexedDB run outbox module and deterministic tests. Status: committed `fa7a657`; 7 outbox tests pass.
- T2 — S4, route delegated-direct (parallel writer): local Supabase migration/RPC for idempotent run start/terminal persistence, with migration tests; no remote apply. Status: complete, commit pending; 4 static migration tests pass; no PostgreSQL execution.
- T3 — S1–S3, route inline: default-on persistent opt-out, outbox integration/replay, privacy UI/docs updates, and existing optional public alias flow. Status: implemented, commit pending.
- T4 — S1–S4, route inline: full suite, local/browser verification if available, independent high-risk verification, native RDD assessment/review as required, and task closure. Status: pending.

## Log

- L1 (user verbatim): “I want to save every players run even if does not provide a name, I want this to work like observability works to have real players data”
- L2 (user selection): “Default on, opt-out (Recommended)” — collect pseudonymous run summaries by default, explain clearly, provide a setting to disable; public name/leaderboard remains opt-in.
- L3 (evidence/context): Existing run client currently requires either statistics or rescue opt-in; Supabase SDK is lazy-loaded; terminal writes have bounded in-memory retry only. Existing privacy model prohibits IP/user-agent fields in game-owned tables/logs and discloses provider-side metadata processing. Supabase paused-project HTTP 540 cannot be restored by a client ping.
- L4 (decision): use a durable browser outbox and idempotent local database RPC; preserve session-only anonymous Auth, no remote operations, no service-role key.
- L5 (progress): Feature document created before source changes. Mirror status: pending until Engram write is confirmed.
- L6 (user selection): “stacked-to-main”. Use reviewable work-unit commits and keep PR creation/push under ordinary user control.
- L7 (design): T1 and T2 have disjoint edit surfaces and a fixed shared outbox/RPC contract; launch together. Parent owns all existing-file integration, docs, git, and final seam verification.
- L8 (route): T1/T2 delegated in parallel (distinct new modules/migration and tests); T3/T4 parent-inline. This is the Write-rule parallelism trigger.
- L9 (security design): Durable retry after reload must work without persisting Auth tokens. Use the UUID already generated per run as the idempotency/capability key, and permit only a terminal transition for that same in-progress run from a refreshed anonymous session; do not transfer row ownership or expose reads.
- L10 (verification correction): Parent read-through found the initial T2 RPC rejected a legitimate outbox replay after session-only anonymous Auth rotated. Added a RED assertion and removed only the cross-session owner rejection; the function still requires authenticated opt-in, the private run UUID, matching difficulty, and non-conflicting lifecycle/payload, and never transfers row ownership.
- L11 (assumption-challenge correction): Independent challenge found the initial RPC could insert a terminal run with a fresh UUID, bypassing the start lifecycle. Added a RED assertion; the migration now rejects terminal-only inserts and the outbox sends an idempotent start before a queued terminal. If IndexedDB is unavailable, direct terminal updates require a confirmed start row.
- L12 (verification): Full suite before the bounded correction: 98 total, 87 pass, 11 skipped, 0 fail. The independent verifier’s bounded S4 recheck passed: 1 migration assertion, 2 lifecycle integration tests, and `node --check public/run-records.mjs`.
- L13 (progress): Default-on local opt-out, replay hooks, queued-save status, and privacy/setup docs are implemented. No live database operation or browser automation was performed; PostgreSQL/browser proof remains unavailable.
- L14 (RDD status): T1 assessment was high/unassessable due untracked inventory. Native STATUS returned `collect` with `capture_operation: external.select_intended_untracked`; that operation is not exposed in the current runtime tool catalog, so no START/review authority was created. Do not invent a selection or bypass the lifecycle.
- Mirror status: pending (Engram rejected the write because multiple project sessions are active).
- Next: commit the three work-unit slices, assess each committed slice under native RDD, and resolve any consent/verification transitions before closure.

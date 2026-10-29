Objective: Implement every architecture-review candidate behind deep seams with tests, preserving game behavior. Branch: feature/architecture-review-deepening-resume. Delivery: ask-on-risk; chain: stacked-to-main. Runner: node --test tests/*.test.mjs.

## Specs
- S1 (audio): User said "Audio first". Authorized scope: deepen Audio behind `play(kind, {dist})` plus `startAmbience` / `stop` with a silent null-sink adapter; migrate all eighteen call shapes; existing synth methods stay until moved. Acceptance: `tests/audio.test.mjs` passes; seam test in `tests/architecture-fitness.test.mjs` proves wiring; suite green.
- S2 (bestiary): User said "continue, can you run parallel agents to complete all the tasks?" Authorized scope: uniform entity module behind `spawn(kind, x, z)` with `tick(now, dt)` plus kind tag; five factories return one shape. Acceptance: new `public/bestiary.mjs` + `tests/bestiary.test.mjs` pass via injected mesh factory (no direct THREE import); no `switch on kind fields` outside module after wiring.
- S3 (floor): Same authorization as S2. Authorized scope: floor-builder returns a level description with query interface `collides(p, r)`, `pickupAt(p)`; layout/search/placement/disposal/colliders inside. Acceptance: new `public/level.mjs` + `tests/level.test.mjs` pass with injected geometry; `buildFloor` 182-line mix plus direct `wardPos` / `pistolPos` reads gone after wiring.
- S4 (hud): Same authorization as S2. Authorized scope: Hud module with `render(state)`; dirty-checking behind the seam via document adapter. Acceptance: new `public/hud.mjs` + `tests/hud.test.mjs` pass with fake document; sim/DOM mix gone after wiring.
- Assumptions: `public/bestiary.mjs`, `public/level.mjs`, `public/hud.mjs` are new-file names chosen by parent (review named seams, not files); index.html wiring stays parent-owned to keep parallel surfaces disjoint.

## Tasks
- T1 (S1, route: parent-inline, status: completed, evidence: 80dd786 — all 18 call shapes via play(kind), synth untouched; suite 61 pass / 0 fail): done.
- T2 (S2, route: delegated module/test writer + parent-inline Game wiring; status: verified, commit pending; Risk: none — deterministic behavior/integration tests and browser self-test cover the migrated entity seam): `tests/bestiary.test.mjs` 16/16, `tests/architecture-fitness.test.mjs` 9/9, suite 93/93, isolated Chrome `?test` 65/65; independent verifier found no change-caused blocker.
- T3 (S3, route: parent-inline module/test/Game wiring; status: pending; existing evidence: wired-spot committed 0ba69be, `_spotBlocked` delegates to `spotBlocked` with finite-guard preserving old edge behavior): remaining work is adopting level collision, pickup, placement/search, and disposal behavior without losing push-out mutation, pickup radii/order, or existing layout invariants.
- T4 (S4, route: parent-inline HUD module/test/wiring; status: pending; Risk: item 6 — browser-visible banner animation has no automated end-to-end coverage): preserve the existing `bannerIn` restart behavior and verify in browser (`?test` + manual banner check) before closing the remaining `_sync` DOM seam.

## Log
- L1 (user verbatim): "we were working in this architecture review: file:///private/var/folders/y6/qfdnxxsj6jv8_xlgpxrchvvr0000gn/T/architecture-review-1791325454.html can we continue on that work?"
- L2 (user verbatim after slice choice): "Audio first"
- L3 (user verbatim): "continue"
- L4 (user verbatim): "continue, can you run parallel agents to complete all the tasks?"
- Evidence: audio seam module RED (ERR_MODULE_NOT_FOUND) -> GREEN (5 pass); play wiring RED (seam test) -> GREEN (10 pass focused); suite 47 pass / 0 fail / 11 skipped. Router self-call caught and fixed (chime). Parallel topology: same-tree, disjoint new-file surfaces, parent owns public/index.html + fitness test + git; writers run focused test only, parent runs one seam check at end.
- L5 (user verbatim): "finish the work please"
- Evidence: wiring slice RED (2 fail on stashed old index.html) -> GREEN (74 tests / 63 pass / 0 fail / 11 skipped); commits 0ba69be + doc. HUD not wired: animation-retrigger gap found by reading index.html:306-307 vs hud.mjs writeText.
- Next: your call on the HUD blocker (extend + browser-QA wire, or close as explored).
- L6 (user verbatim, 2026-10-29): "si lanza multiples agentes de gentle ai para terminar todo"
- Routing: a read-only explorer mapped T2–T4; one bounded writer completed T2's disjoint module/test slice, with the parent retaining `public/index.html`, shared architecture-fitness wiring, and Git. T3 and T4 are parent-inline; T2's item-6 risk was independently verified. No parallel writers ran in one worktree.
- Branch continuity: the existing `feature/architecture-review-deepening` branch is 4 commits behind and 17 ahead of the current `main`; continuation starts from `82ecd80` on `feature/architecture-review-deepening-resume`, leaving the prior branch untouched.
- T2 writer evidence: `public/bestiary.mjs` and `tests/bestiary.test.mjs` were changed in scope. Focused test RED (missing export) -> GREEN (10/10); parent spot-check also passed 10/10 and `git diff --check` passed. No scratch paths were created; no commit yet.
- T2 integration RED: `node --test tests/architecture-fitness.test.mjs` produced 6 pass / 2 fail before wiring; GREEN after integration at 9/9. Added deterministic probes for each enemy behavior identified by the independent verifier.
- T2 final checks: `node --test tests/bestiary.test.mjs` 16/16; `node --test tests/architecture-fitness.test.mjs` 9/9; `node --test tests/*.test.mjs` 93/93; isolated Chrome `/?test` 65/65. The independent verifier ran the previous candidate in scratch and found no blocker; its suggested coverage probes were added and passed.
- T2 scratch cleanup: verifier and parent browser-smoke temp directories were removed. Chrome emitted an updater history event outside the temp profile during verification; that location was not inspected or cleaned.
- Delegated assessment: native assessment was unassessable because existing untracked `.codegraph/` had no explicit inventory scope; RDD mode is on. No review lifecycle was started for this incomplete candidate.
- Delivery: the current authored diff exceeds the `ask-on-risk` ~400-line threshold; chain strategy is now cached as `stacked-to-main`. This selects local slicing only and does not authorize push or PR creation.
- L7 (user choice verbatim, 2026-10-29): "PRs apilados a main (recomendado)"
- PR slicing: T2 is currently 948 changed lines, so the selected stacked-to-main strategy still needs one honest ≤400-line slicing pass before any PR is prepared. T3/T4 boundaries will be sized after completion. No push or PR creation is authorized.

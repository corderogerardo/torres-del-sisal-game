Objective: Implement every architecture-review candidate behind deep seams with tests, preserving game behavior. Branch: feature/architecture-review-deepening. Delivery: ask-on-risk. Runner: node --test tests/*.test.mjs.

## Specs
- S1 (audio): User said "Audio first". Authorized scope: deepen Audio behind `play(kind, {dist})` plus `startAmbience` / `stop` with a silent null-sink adapter; migrate all eighteen call shapes; existing synth methods stay until moved. Acceptance: `tests/audio.test.mjs` passes; seam test in `tests/architecture-fitness.test.mjs` proves wiring; suite green.
- S2 (bestiary): User said "continue, can you run parallel agents to complete all the tasks?" Authorized scope: uniform entity module behind `spawn(kind, x, z)` with `tick(now, dt)` plus kind tag; five factories return one shape. Acceptance: new `public/bestiary.mjs` + `tests/bestiary.test.mjs` pass via injected mesh factory (no direct THREE import); no `switch on kind fields` outside module after wiring.
- S3 (floor): Same authorization as S2. Authorized scope: floor-builder returns a level description with query interface `collides(p, r)`, `pickupAt(p)`; layout/search/placement/disposal/colliders inside. Acceptance: new `public/level.mjs` + `tests/level.test.mjs` pass with injected geometry; `buildFloor` 182-line mix plus direct `wardPos` / `pistolPos` reads gone after wiring.
- S4 (hud): Same authorization as S2. Authorized scope: Hud module with `render(state)`; dirty-checking behind the seam via document adapter. Acceptance: new `public/hud.mjs` + `tests/hud.test.mjs` pass with fake document; sim/DOM mix gone after wiring.
- Assumptions: `public/bestiary.mjs`, `public/level.mjs`, `public/hud.mjs` are new-file names chosen by parent (review named seams, not files); index.html wiring stays parent-owned to keep parallel surfaces disjoint.

## Tasks
- T1 (S1, route: parent-inline, status: completed, evidence: 80dd786 — all 18 call shapes via play(kind), synth untouched; suite 61 pass / 0 fail): done.
- T2 (S2, route: parent-inline wiring, status: wired-dispatch committed 0ba69be (entity-shape migration pending browser QA), evidence: RED 2 fail on old index.html via stash -> GREEN 63 pass / 0 fail; _spawnEntities + _tickRespawn switch sites now dispatch via SPAWN_FACTORY/RESPAWN_FACTORY with identical fallback): move _make* bodies + _updateEntities motion into injected behaviors next, needs game run.
- T3 (S3, route: parent-inline wiring, status: wired-spot committed 0ba69be (collides/pickupAt adoption pending), evidence: same RED->GREEN; _spotBlocked delegates to spotBlocked with finite-guard preserving old edge behavior): _collide keeps push-out mutation (collides is pure boolean, contract mismatch), pickupAt consumption model differs from proximity re-checks, _findFreeSpot has no module equivalent.
- T4 (S4, route: none, status: BLOCKED — Needs your decision, evidence: index.html:306 restarts bannerIn animation via style/offsetWidth reflow on every banner; hud.mjs writeText only sets textContent + hidden class): wiring _sync through hud.render would silently kill the banner animation. No test covers visuals (Risk item 6). Blocker: extend hud.mjs with animation support + verify in browser (?test + manual banner check), then wire. Say which half you want: (a) extend + wire with browser QA, or (b) leave HUD as explored-not-implemented.

## Log
- L1 (user verbatim): "we were working in this architecture review: file:///private/var/folders/y6/qfdnxxsj6jv8_xlgpxrchvvr0000gn/T/architecture-review-1791325454.html can we continue on that work?"
- L2 (user verbatim after slice choice): "Audio first"
- L3 (user verbatim): "continue"
- L4 (user verbatim): "continue, can you run parallel agents to complete all the tasks?"
- Evidence: audio seam module RED (ERR_MODULE_NOT_FOUND) -> GREEN (5 pass); play wiring RED (seam test) -> GREEN (10 pass focused); suite 47 pass / 0 fail / 11 skipped. Router self-call caught and fixed (chime). Parallel topology: same-tree, disjoint new-file surfaces, parent owns public/index.html + fitness test + git; writers run focused test only, parent runs one seam check at end.
- L5 (user verbatim): "finish the work please"
- Evidence: wiring slice RED (2 fail on stashed old index.html) -> GREEN (74 tests / 63 pass / 0 fail / 11 skipped); commits 0ba69be + doc. HUD not wired: animation-retrigger gap found by reading index.html:306-307 vs hud.mjs writeText.
- Next: your call on the HUD blocker (extend + browser-QA wire, or close as explored).

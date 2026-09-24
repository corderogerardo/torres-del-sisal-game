# Architecture Fitness and Player Support

## Objective

Evolve Torres del Sisal toward a testable, modular vanilla-JavaScript game architecture, add measurable architecture/runtime fitness checks, and put supportive mental-health guidance on the Spanish intro screen for players in Venezuela.

## Problem and Why

The deployed game is a static Three.js r128 page whose game behavior, rendering, input, audio, and DOM updates are concentrated in one `Game` class in `public/index.html`. That structure makes architecture boundaries and behavioral changes hard to verify. The rooftop suicide theme also needs a thoughtful content note and a clear, nonjudgmental path toward help.

## Scope and Constraints

- Keep the game static, offline-capable, and on vanilla Three.js; no backend, analytics, framework, CDN dependency, or new runtime package.
- Refactor incrementally. Do not rewrite the whole game or change its gameplay as part of this foundation.
- Keep core rules independent of Three.js and the DOM; apply SOLID only where a real boundary improves testability.
- Add local-only performance diagnostics; never collect or transmit player behavior or mental-health information.
- Support copy is professional Spanish for Venezuela. Do not publish an unverified hotline or emergency number; a verified local contact can be added after source verification.
- Preserve existing controls, gameplay, built-in `?test` harness, and visual identity.
- TDD is enabled by session configuration. Primary added-test runner: Node's built-in test runner (`node --test`). Browser regression: serve `public/` and run the existing `?test` harness.
- Delivery strategy: `ask-on-risk`; keep authored changes near the advisory 400-line work-unit heuristic and ask before creating any commit or PR.

## Authorized Scope

This feature only: modular game-rule seam, its architecture fitness checks, local runtime metrics, Venezuela-focused supportive intro content, tests, and directly relevant documentation. Do not alter deployment, dependencies, or unrelated horror/game content.

## Forecast

- Estimated authored change: approximately 350 lines across the initial foundation, excluding generated/vendor files.
- Work units: 3; each must leave the game usable and include relevant tests/docs.
- TDD source: Strict TDD Mode enabled in session instructions; runner is `node --test` for pure-module checks and the repository's browser `?test` harness for game integration.

## Tasks

- [x] ODD-1 — Add an accessible, nonjudgmental Venezuela-focused support/content-note panel to the intro without an unverified phone number; test presence, keyboard reachability, and no tracking.
- [x] ODD-2 — Extract a small pure game-rules/configuration seam from `Game`, wire it into the game, and prove it with Node tests that enforce no Three.js/DOM imports.
- [x] ODD-3 — Add a dependency-boundary fitness check and opt-in local runtime metrics (frame-time percentiles, FPS, draw calls, geometry/texture counts); document thresholds and verification.

## Acceptance Criteria

- The support message is visible before gameplay starts, uses supportive Spanish without stigma or promises of treatment, and includes an immediate-danger direction without inventing a Venezuela-specific number.
- New core rules can be tested without constructing `Game`, a browser DOM, or a Three.js scene.
- Automated checks fail if the pure game-rules module acquires rendering/browser dependencies.
- `?metrics` (or the implemented equivalent) reports bounded local runtime measurements without network requests or persistent player data.
- Existing game interactions and the `?test` harness remain functional.
- All new tests are observed failing before production changes and passing after implementation.

## Progress and Evidence

- Branch: `feature/architecture-fitness-support`.
- Baseline: tracked working tree was clean; pre-existing untracked `.atl/` is user data and must remain untouched.
- RDD mode is on globally. No review or delivery receipt has been created for this work.
- ODD-1 evidence: the new panel test first failed because the intro had no support section, then passed after the panel was added. Static checks cover visibility before entry, accessible naming and keyboard focus, immediate-danger guidance, no phone number, and no tracking/persistence APIs. In Playwright Chromium, `http://127.0.0.1:4173/?test` displayed the support panel before the start button and the built-in game self-test passed **65/65**. A Venezuela-specific hotline/source could not be verified in this runtime; none is included.
- ODD-2 evidence: the new rules tests first failed with the expected `ERR_MODULE_NOT_FOUND` for `public/game-rules.mjs`; after extracting the three immutable difficulty configurations and wiring `Game.diff()` to `getDifficultyConfig`, `node --test tests/game-rules.test.mjs tests/support-panel.test.mjs` — 5 passed. Tests preserve all three difficulty values, verify the Normal fallback, and reject config mutation. `public/index.html` loads as a module to import the local pure rules module. Browser integration remains unverified because no usable browser tool is available.
- ODD-3 evidence: the architecture/runtime-metrics tests first failed with the expected missing `public/runtime-metrics.mjs`, then `node --test tests/architecture-fitness.test.mjs` passed 4/4 after implementation. The checks reject imports and browser/render/network/storage globals in both pure modules, verify `?metrics` wiring, bound frame samples, validate p50/p95/p99 and average FPS, and check renderer counters. `README.md` documents the 300-sample cap, five-second local console reports, and investigation signals (p95 >20 ms or average FPS <50; no universal scene-count thresholds). `node --test tests/*.test.mjs` passed all 9 tests; `node --check` passed for both `.mjs` modules; `git diff --check` passed. A live browser sample and the `?test` harness were not run because no usable browser test tool is available; real renderer counts and timings remain unmeasured.
- Estimated authored implementation changes remain below the approximately 350-line forecast (roughly 225 lines across UI, rule seam, metrics, fitness tests, task evidence, and relevant documentation; generated/vendor files excluded).
- Parent verification update (supersedes the initial browser-unavailable notes above): Playwright Chromium ran `/?test` and reported 65/65 passed with a 0.21 ms/frame micro-benchmark. `/?metrics` reported two bounded samples: (60.1 FPS, p50/p95/p99 16.7/17.6/17.8 ms, 50 draw calls, 68 geometries, 0 textures) and (60 FPS, p95 17.4 ms, 54 draw calls, 83 geometries, 0 textures). Browser console also showed an unrelated `/favicon.ico` 404. No Venezuela-specific hotline/source was verified, so no number or external resource link is included.
- Commit identities: pending; no commit is authorized unless the user explicitly asks.

## Next Step

All three implementation tasks are complete. The `?test` harness and `?metrics` were exercised locally. A verified Venezuela-specific hotline/source remains a follow-up before adding any number or external resource link. No commit is authorized in this task.

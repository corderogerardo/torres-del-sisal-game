# ADR 0001: Keep a modular monolith of static ESM and Three.js

- **Status:** Accepted
- **Date:** 2026-10-29
- **Scope:** Runtime architecture of `public/`. No build tooling, hosting, or data-model change.
- **Related:** [Architecture overview](../architecture.md), [architecture review task](../../odd/tasks/architecture-review-deepening.md).

## Context

Torres del Sisal ships as one static directory. `public/index.html` loads a vendored
Three.js r128 build and a single module script, and the whole game is served by any
static file server and deployed to Cloudflare Pages by copying `public/`. There is no
package manifest, bundler, transpiler, or dependency install step, and core gameplay
must stay playable offline.

That shape had a cost. `index.html` grew to own world building, rendering, combat,
objectives, placement, pickup orchestration, audio synthesis, HUD writes, input
handling, and the survival rules. None of that could be tested in Node, every change
required a full-game browser check, and parallel work collided in one file.

An architecture review named the engine seams that would remove the worst coupling and
proved them out one at a time: `game-rules`, `runtime-metrics`, `run-state`,
`engine-loop`, `hud`, `input`, `audio`, `level`, and `bestiary`, plus the telemetry
modules. Each engine seam shipped with Node tests and a browser self-test run, and the
fitness suite pins the wiring that keeps the seam in use. The review also considered
replacing the architecture outright.

Forces at play:

- Preserve the tuned render path (matte Phong, unlit self-lit meshes, no per-entity
  lights, adaptive resolution) and the existing deploy story.
- Make engine rules testable without a browser or a GPU.
- Keep dependencies explicit so a contributor or agent can see what a module may touch.
- Keep edits small enough to land per seam instead of as one rewrite.
- Accept that some responsibilities are cheaper to leave in `Game` for now.

## Decision

Keep a **modular monolith**:

- Static vanilla ES modules plus a vendored Three.js r128. No bundler, framework, ECS,
  or dependency-injection container.
- Adapters are constructed and injected at the **composition root** in
  `public/index.html`. `Game` owns the DOM handles, the renderer, and the adapter wiring;
  modules never reach for those.
- Modules with no platform dependency stay browser-free: no imports, no `window`,
  `document`, `THREE`, network, storage, or timers.
- Seams are **feature-oriented**, not layer-oriented: `audio`, `bestiary`, `level`,
  `hud`, `input`, `run-state`, `engine-loop`. A module exists because a behavior varies
  there, not because a diagram has a box for it.
- Behavior is preserved seam by seam. A refactor is accepted only when the Node suite
  and the in-page `/?test` harness stay green.

## Options considered

### 1. Status-quo monolith

Keep everything in `index.html` and keep tuning it.

- **Pros:** zero migration risk, no coordination cost, proven performance, nothing to
  relearn.
- **Cons:** engine rules stay untestable, dependencies stay implicit, DOM and Three.js
  globals leak into logic, every change needs full-game QA, and parallel edits conflict
  in one file. Rejected: it does not scale past the current feature set.

### 2. Framework, bundler, or ECS rewrite

Rebuild the game on a framework with an ECS, a build step, and a component model.

- **Pros:** conventional structure, entity composition, richer tooling, static types if
  TypeScript is added.
- **Cons:** a rewrite of a shipped, performance-tuned game; a new build and deploy chain;
  new dependency and supply-chain surface; an ECS buys composition that six enemy kinds
  do not need, and it would not by itself make the survival rules testable. Rejected:
  the cost is real and the user-visible benefit is not.

### 3. Incremental modular monolith (chosen)

Extract one seam at a time behind a small interface, inject its adapters at the
composition root, and keep the runtime and deploy unchanged.

- **Pros:** each slice is reviewable and independently testable; behavior is pinned by
  tests before the next extraction; the render path is untouched; no new tooling.
- **Cons:** the result is uneven while it lands — `Game` stays large, some seams are
  pure while others are adapters, and discipline is required to stop the root from
  absorbing new logic again. Accepted: unevenness is visible and temporary, and the
  follow-ups below bound it.

## Consequences

Positive:

- Pure modules (`game-rules`, `runtime-metrics`, `run-state`, `engine-loop`, `hud`,
  `audio`, `level`, `bestiary`) run under `node --test` with no browser, GPU, install,
  or network.
- Dependency direction is explicit: the composition root imports modules; modules do
  not import the root and do not import `three.min.js`. Platform objects arrive as
  arguments or factory options.
- Rendering, difficulty tuning, and deploy stay where they were, so performance and
  hosting are not re-litigated by the refactor.
- Disjoint module files let several writers work in parallel; the composition root stays
  a single, serialized integration point.

Negative:

- `Game` still owns world building, combat, objectives, and floor orchestration. It is
  smaller than before but still the largest hand-written file in the repo.
- Two quality gates remain manual: the HUD banner restart is a CSS-animation behavior
  that a fake document cannot prove, and synthesized audio needs a human listening pass.
- The level lifecycle is wired for collision, free-spot search, keep-aware disposal and
  pickup collection through `level.mjs`, but `buildFloor` still constructs the Three.js
  geometry and object meshes directly. That is an intentional adapter boundary, not a
  second rule engine.
- The fitness tests are source-level heuristics, not a sandbox. They catch the common
  regressions (an added import, a `window` reference, a dropped wiring call), not every
  way a module could reach a global.
- There is no static type system, so interface shape is documented in comments and
  enforced by tests.

Neutral:

- `hud`, `audio`, `level`, and `bestiary` are pure in the dependency sense but shaped as
  adapters: they receive nodes, a sink, geometry factories, or a mesh factory. That is
  deliberate — the injected edge is what makes them testable.
- `run-state` takes a resolved difficulty config instead of importing `game-rules`, so
  the rules table remains the single source of tuning values.

## Follow-ups

1. Extract the floor geometry builder if the Three.js construction in `buildFloor`
   becomes the next testability bottleneck; keep level rules in `level.mjs`.
2. Add a short manual checklist for HUD changes: banner appears, animation restarts on a
   repeated message, no layout shift, dirty-checking still suppresses identical writes.
3. Add a listening checklist for audio changes: each kind is audible, distance scaling
   is perceptible, ambience and a one-shot do not clip.
4. Split another responsibility out of `Game` only when a second adapter or a testable
   rule appears. Do not extract a module for a single call site.
5. Revisit this ADR if a second client (desktop wrapper, alternate renderer) or a real
   tooling constraint appears. Until then, a bundler is cost without a requirement.

## References

These informed the seam style. No code was copied; only architectural principles were
reused, and every module here is written against this game's own contracts.

| Project | License | What it informed |
| --- | --- | --- |
| [HexGL](https://github.com/BKcore/HexGL) | Repository MIT, core game files CC BY-NC | Small, explicit module boundaries in a browser racing game; principles only. |
| [BrowserQuest](https://github.com/mozilla/BrowserQuest) | MPL-2.0, archived | A kind-to-factory registry (`entityfactory`) as the shape behind `bestiary`. |
| [rot.js](https://github.com/ondras/rot.js) | BSD-3-Clause | Pure algorithms separated from a display adapter; no DOM in the rule layer. |
| [three.js FPS example](https://threejs.org/examples/#misc_controls_pointerlock) | MIT | A monolithic single-file demo is not automatically a defect; structure follows need. |
| [LittleJS](https://github.com/KilledByAPixel/LittleJS) | MIT | Named engine phases (init, update, render) as a small, readable loop contract. |
| [melonJS](https://github.com/melonjs/melonJS) | MIT | A dedicated state module instead of scattering phase checks through the loop. |

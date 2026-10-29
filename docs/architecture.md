# Architecture

Torres del Sisal is a **modular monolith**: one static page whose `Game` class is the
composition root, plus feature-oriented ES modules with injected adapters. There is no
bundler, framework, ECS, or DI container. The reasoning and rejected alternatives are
recorded in [ADR 0001](adr/0001-modular-monolith.md).

This document describes the shipped structure, the dependency rules that keep it
honest, how to extend it without editing unrelated modules, and what is still missing.

## Module map

Everything runs from `public/`. `public/index.html` is the composition root: it loads
the vendored Three.js build as a classic script and is the only place that wires the
runtime modules together.

| File | Kind | Public interface | Injected collaborators | Tests |
| --- | --- | --- | --- | --- |
| [`public/index.html`](../public/index.html) | Composition root | `Game` (not exported), page markup | Modules, DOM, `window.THREE` | Browser `/?test` |
| [`public/game-rules.mjs`](../public/game-rules.mjs) | Pure | `getDifficultyConfig(name)` | — | `game-rules.test.mjs` |
| [`public/runtime-metrics.mjs`](../public/runtime-metrics.mjs) | Pure | `RuntimeMetrics(capacity)`, `record(ms, rendererInfo)`, `snapshot()` | — | `architecture-fitness.test.mjs` |
| [`public/run-state.mjs`](../public/run-state.mjs) | Pure | `createRunState(options)`, `stepRunState(state, dt, frame)` → `{ state, events }` | Resolved difficulty config; frame observations as data | `run-state.test.mjs` |
| [`public/engine-loop.mjs`](../public/engine-loop.mjs) | Pure scheduler | `createGameLoop(options)` → `{ start, stop, isRunning, tick }` | `requestFrame`, `cancelFrame`, `now`, `update`, `render` | `engine-loop.test.mjs` |
| [`public/hud.mjs`](../public/hud.mjs) | Pure view model | `createHud({ el })` → `{ render(state) }` | DOM nodes by name | `hud.test.mjs` |
| [`public/audio.mjs`](../public/audio.mjs) | Policy over a sink | `AUDIO_KINDS`, `levelFor(kind, dist)` plus per-kind level helpers, `createAudioEngine({ sink })`, `createNullAudioEngine()` | `sink` methods per kind plus `startAmbience` / `stop` | `audio.test.mjs` |
| [`public/level.mjs`](../public/level.mjs) | Pure level description and helpers | `LEVEL_LAYOUTS`, `spotBlocked(x, z, blocked)`, `findFreeSpot(options)`, `disposeGroup(group, { keep })`, `createLevel({ createBox, layout })` → `{ collides, pickupAt, resolve }` | `createBox` geometry factory; layout data; `rng`, colliders, and placed list for search; keep predicate for disposal | `level.test.mjs` |
| [`public/bestiary.mjs`](../public/bestiary.mjs) | Pure behavior over a mesh factory | `BESTIARY_KINDS`, `createBestiary(options)` → `{ spawn, tick, animate, remove, clear }`, `createBestiaryMeshFactory(options)`, `createNullBestiary()` | Mesh factory, vector factory, random, world context | `bestiary.test.mjs` |
| [`public/input.mjs`](../public/input.mjs) | DOM adapter | `createInputController(options)` → `bind`, `unbind`, `getState`, `setSensitivity`, `setFallbackLook`, `setLook`, `resetLook` | `target`, `document`, `isActive`, `onAction` | `input.test.mjs` |
| [`public/run-telemetry.mjs`](../public/run-telemetry.mjs) | Adapter | `getRunTelemetryEnabled`, `setRunTelemetryEnabled`, `isValidSupabaseConfig`, `createRunSession`, `createRunTelemetryClient` | Storage, clock, UUID source, SDK loader, outbox | Telemetry tests |
| [`public/run-outbox.mjs`](../public/run-outbox.mjs) | Adapter | `createRunOutbox(options)` | `indexedDB`, storage adapter | `run-outbox.test.mjs` |

Two boundaries are worth stating precisely:

- **Pure by imports is not the same as trivial.** `bestiary` imports nothing, but its
  injected world context exposes the camera, torch state, nearest-threat distance,
  `roomHalf`, `play`, `_banner`, and `_dread`. That context is part of its interface.
  `hud` and `level` likewise depend on the shape of injected nodes or layout data.
- **Adapters may keep convenience defaults.** `input` falls back to `globalThis` and
  `run-outbox` falls back to `globalThis.indexedDB` so the browser boot is short. Tests
  always inject fakes; production relies on the defaults.

## Dependency direction

```text
public/index.html  (composition root: Game, DOM, THREE, render)
├── game-rules.mjs        pure
├── runtime-metrics.mjs   pure
├── run-state.mjs         pure
├── engine-loop.mjs       pure scheduler
├── hud.mjs               view model, injected DOM nodes
├── audio.mjs             play(kind) policy, injected sink
├── level.mjs             level description, injected box factory
├── bestiary.mjs          entity behavior, injected mesh factory
├── input.mjs             DOM adapter, injected target/document
└── run-telemetry.mjs     adapter
    └── run-outbox.mjs    IndexedDB adapter, injected indexedDB
```

The single module-to-module edge is `run-telemetry` → `run-outbox`, both adapters. No
module imports `index.html`, and no module imports `three.min.js`; Three.js reaches
`bestiary` as the `THREE` option of the injected mesh factory.

### Allowed

- Composition root → any module.
- Module → collaborators passed in as arguments, options, or callbacks.
- Adapter → pure sibling or another adapter when the interface is explicit.
- Pure module → no imports at all. Share values by parameter, not by importing state.

### Forbidden

- A module importing the composition root, or reading page state it was not given.
- A pure module importing a runtime dependency, or touching `window`, `document`,
  `THREE`, `localStorage`, `sessionStorage`, `fetch`, `XMLHttpRequest`, or `sendBeacon`.
  `tests/architecture-fitness.test.mjs` checks these by source pattern.
- A module importing `three.min.js` or assuming a global `THREE`.
- Reaching into another module's internals. Only exports are public.
- Adding a seam before something actually varies across it. One adapter is a
  hypothetical seam; two adapters make it real.

## Composition root and lifecycle

`Game` is constructed once. It is both the composition root and, for now, the scene
and gameplay orchestrator.

```text
page load
  → three.min.js (classic script)
  → module script imports the seams
  → new Game()
      capture DOM nodes, build state and telemetry client
      createHud, createInputController, createAudioEngine({ sink })
      _wire()          bind buttons, input listeners, resize and online handlers
      _waitThree()     poll until window.THREE exists
  → _initThree()
      renderer, scene, camera, lights, dust
      createBestiary({ context, meshFactory, createVector3 })
      buildFloor(1)    colliders and pickup objects, createLevel(), createRunState()
      createGameLoop({ requestFrame, cancelFrame, now, update }).start()
  → every frame: _frame(dt, now)
      input.getState() → look, pointer lock, pause
      _game(dt) / _rooftop(dt) → _stepRun() → stepRunState()
      bestiary.tick() and bestiary.animate(), render
      game state changes → _sync() → hud.render() (diffed)
  → Enter → start(): _startAudio(), buildFloor(1), pointer lock
```

Key details:

- The loop owns delta clamping and scheduling. `Game` only supplies RAF adapters and an
  `update` callback; `_frame` does not schedule itself.
- `buildFloor(n)` tears down the previous floor group, rebuilds geometry and colliders,
  creates the level description with `createLevel({ layout: { kind: 'room', colliders } })`,
  and resets the run through `createRunState`. Floor 7 is the rooftop: time becomes a
  sentinel and temptation replaces the floor timer.
- Survival and progression rules live in `stepRunState`. `_applyRunEvents` translates
  returned events (forced ascension, carreton, lifeline, jump, rescue) into game effects.
  Pickups and phone use call `_syncRunFromGame` to push counters back into run state.
- HUD writes are diffed inside `hud.render`. Calling `_sync` with unchanged state does
  not touch the DOM.

## Extending without touching unrelated modules

### Add an enemy

1. In [`bestiary.mjs`](../public/bestiary.mjs), add the kind to `KINDS`, add an
   `ENTITY_FACTORIES` entry returning the shared settings shape (`state`, `speed`,
   `catchRadius`, `grace`, `catchMessage`), and add a visual branch to the mesh factory.
2. In [`index.html`](../public/index.html), map a spawn plan code in `SPAWN_FACTORY`,
   place the code in the floor plan inside `_spawnEntities`, and add a `RESPAWN_FACTORY`
   entry if the entity can respawn.
3. Extend `tests/bestiary.test.mjs`. Touch no other module.

Behavior that is genuinely different routes through `createBestiary({ behaviors })`
instead of adding kind branches to `Game`.

### Add a sound

1. In [`audio.mjs`](../public/audio.mjs), add the kind to `KINDS`; add a `levelFor` case
   only if the sound scales with distance.
2. In [`index.html`](../public/index.html), add one method to the `sink` object passed to
   `createAudioEngine` and call `this.play('kind')` at the event site.
3. Extend `tests/audio.test.mjs`. Ambience is the exception: it still starts from
   `_startAudio`, and the engine's `startAmbience` / `stop` are not wired to a Game sink
   yet (see gaps).

### Add a floor item

This is the least settled path today, because the level lifecycle is incomplete.

What works now:

1. Create the visual and its position in `buildFloor`, alongside the existing ward,
   pistol, memento, and phone fields.
2. Add a distance check in `_game` with the item's radius and first-match ordering.
3. Add a `tests/level.test.mjs` case only if the item is also described in the layout.

That touches `Game` in several places. It is the known T3 gap, not the pattern to copy.

Target shape once the level lifecycle lands:

- Describe the pickup in the layout passed to `createLevel` as `{ id, x, z, radius }`.
  `pickupAt` returns the first un-taken item within its radius and marks it taken, so
  ordering and radii live in one place.
- Keep the visual in `buildFloor`.
- In `_game`, query `this.level.pickupAt(camera.position)` and dispatch on the returned
  `id`; no per-item radius checks remain.
- Add a `tests/level.test.mjs` case for the new layout entry.

### Add a UI field

1. Add the node to the markup in [`index.html`](../public/index.html).
2. Add it to the `_el` map and map the value in `_sync`'s HUD view model.
3. Add one `writeText`, `writeStyle`, or `writeHidden` call in
   [`hud.mjs`](../public/hud.mjs) with a stable cache key.
4. Add a fake-node assertion in `tests/hud.test.mjs`, then verify the field and any
   affected banner copy manually in a browser.

No game logic or renderer code should need to change for a field that already exists in
the view model.

## Testing strategy

Three layers, each with a different job:

1. **Node tests — `node --test tests/*.test.mjs`.** No install, no browser, no network.
   Pure modules run in-process; adapters run against fakes (fake document, fake target,
   fake frame queue, fake sink, fake IndexedDB, injected clock and storage). Focused
   runs work the same way, for example `node --test tests/level.test.mjs`.
2. **Architecture fitness — `tests/architecture-fitness.test.mjs`.** Source-level
   checks that pure modules have no imports and no browser/Three.js/network/storage
   identifiers, that `Game` imports and calls the wired seams, that audio routes through
   `play(kind)`, that the bestiary owns entity lifecycle, and that `Game` does not branch
   on enemy kind. Add one assertion when a seam's contract changes. These are regression
   guards, not a sandbox.
3. **Browser self-test — `/?test`.** Serve `public/` over HTTP and open the query
   parameter. The in-page harness asserts per-floor structure, phone-on-rooftop only,
   mementos, targeting, clamps, ascension, difficulty configs, pickups, and a render
   micro-benchmark. Agents and CI smoke runs use headless Chrome with SwiftShader so
   WebGL works without a GPU. `?metrics` adds local frame-time and renderer-count
   diagnostics; it is not a failure gate.

Manual QA remains for the two things a fake cannot prove: the HUD banner animation
restart and the audio mix. See below.

## Known gaps

| Gap | Where | Impact | Next step |
| --- | --- | --- | --- |
| Level lifecycle wired | [`level.mjs`](../public/level.mjs) owns collision, free-spot search, keep-aware disposal and pickup collection; [`buildFloor`](../public/index.html) still constructs the Three.js geometry and object meshes | Level rules are tested and single-sourced; the geometry builder remains the adapter-side implementation | Extract the floor geometry builder only if it becomes the next testability bottleneck |
| HUD banner QA is manual | `writeBanner` in [`hud.mjs`](../public/hud.mjs) | Restarting a CSS animation requires clearing it, forcing layout, and re-applying it; a fake document cannot prove the banner re-animates | Browser checklist on every HUD change: banner shows, repeats restart, no layout shift |
| Audio mix QA is manual | synth methods and `_startAudio` in [`index.html`](../public/index.html) | Only `play(kind)` routing and levels are unit tested; audibility, balance, and clipping are not | Listening checklist; implement the sink's `startAmbience` / `stop` when ambience moves behind the seam |
| `Game` is still large | [`index.html`](../public/index.html) | Owns world building, combat, objectives, placement, run orchestration, and floor teardown; the root is the most likely place for new coupling | Extract only when a second adapter or a testable rule appears |

## References

- [ADR 0001: modular monolith](adr/0001-modular-monolith.md)
- [README: project layout and local run](../README.md)
- [Architecture review task](../odd/tasks/architecture-review-deepening.md)
- [Architecture fitness tests](../tests/architecture-fitness.test.mjs)

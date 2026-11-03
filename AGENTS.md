# AGENTS.md

Static browser game (Three.js r128, locally vendored). No bundler, no framework, no
package manager, no install step.

## Commands

| What | Command |
| --- | --- |
| Full test suite | `node --test tests/*.test.mjs` |
| One test file | `node --test tests/level.test.mjs` |
| Serve locally | `cd public && python3 -m http.server 8000` |
| Browser self-test | open `http://localhost:8000/?test` |
| Browser playthrough | `node scripts/playthrough.mjs` |
| Deploy | push to `main`, or `./deploy.sh` |

The suite is 214 tests on Node's built-in runner. It needs no dependencies and no
network access.

## Read this first

[`docs/architecture.md`](docs/architecture.md) is the source of truth: module map with
public interfaces, dependency direction, extension recipes (enemy, sound, floor item,
UI field), testing strategy, and known gaps. Read it before exploring `public/`.

`public/game.mjs` is about 1,180 lines and 84 methods. Do not read it end to end.
Locate the behavior with a grep or a CodeGraph query, then read the surrounding block.

## Module map

| Concern | Module |
| --- | --- |
| Page shell, markup, CSS, build stamp | `public/index.html` |
| Composition root, error handlers, `window._game` | `public/main.mjs` |
| Orchestrator: world, combat, floor lifecycle | `public/game.mjs` |
| Survival and progression rules (pure) | `public/run-state.mjs` |
| Frame scheduler (pure) | `public/engine-loop.mjs` |
| HUD view model with diffed writes | `public/hud.mjs` |
| Difficulty rules (pure) | `public/game-rules.mjs` |
| Frozen run data, spawn maps, floor plans, themes | `public/config.mjs` |
| Pure pickup effects (ward, holy water, memento) | `public/objectives.mjs` |
| Pure aim-target selection | `public/combat.mjs` |
| Frame-time and renderer metrics | `public/runtime-metrics.mjs` |
| Sound policy over an injected sink | `public/audio.mjs` |
| Level description, collision, pickups | `public/level.mjs` |
| Entity kinds, behavior, procedural meshes | `public/bestiary.mjs` |
| Keyboard and pointer-lock adapter | `public/input.mjs` |
| Run telemetry and Supabase adapter | `public/run-telemetry.mjs` |
| IndexedDB retry queue | `public/run-outbox.mjs` |

## Boundaries

Enforced by `tests/architecture-fitness.test.mjs`:

- `game-rules.mjs`, `runtime-metrics.mjs`, `hud.mjs`, `engine-loop.mjs`, and
  `run-state.mjs` are pure: no imports and no browser, Three.js, storage, or network
  identifiers.
- `index.html` has no inline `class Game`; `main.mjs` imports `{ Game, showFatal }` from
  `game.mjs`, which exports both.
- Audio routes through `play(kind)`. `Game` dispatches spawn codes through the bestiary,
  delegates entity lifecycle, and never branches on enemy kind. Spot checks delegate to
  the level module.

Conventions, not currently asserted:

- Only `game.mjs`, `main.mjs`, and `run-telemetry.mjs` import anything. `audio`,
  `bestiary`, `combat`, `config`, `input`, `level`, `objectives`, and `run-outbox` have
  zero imports by design.
- No feature module imports `main.mjs` or `game.mjs`.
- `index.html` stays markup, CSS, build stamp, and script tags. No game logic.
- Do not add a seam before something actually varies across it.

If a change breaks an enforced boundary, fix the change, not the test.

## Vocabulary

The game copy is Spanish; identifiers are English.

| Docs say | Code says |
| --- | --- |
| posesión | `dread`, `_dread` |
| aliento | `stamina` |
| recuerdos | `memento`, `mementos` |
| tentación | `temptation` |
| amuleto | `ward`, `collectWard` |
| agua bendita | `pistol`, `pickupPistol` |
| espantos | bestiary kinds: `sombra`, `sayona`, `llorona`, `silbon`, `duende`, `manguanguas` |

Spanish prose appears in player-facing strings and banner copy; the only Spanish code
identifiers are the folklore kind names listed above. Grep the English term to find any
other code path.

## Not current source

- `project/` — original Claude Design handoff, superseded.
- `odd/tasks/` — historical session logs, not a plan.
- `docs/superpowers/specs/` — design history.
- `public/three.min.js` — vendored; do not edit or upgrade casually.

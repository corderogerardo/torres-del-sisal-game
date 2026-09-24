# Torres del Sisal — El trampolín de la muerte

A first-person horror game set in the cursed *Torres del Sisal*, steeped in the folklore of the Venezuelan *llano*. You wake up inside the tower **already possessed**. The tower's only law is *siempre hacia arriba* — always upward: every time a ghost catches you, or the possession completes, you wake one floor higher. On each floor you can recover a **memento** of who you used to be. At the top waits the rooftop — *el trampolín de la muerte*. Find the phone, make the call, then **resist the temptation to jump** until rescue arrives. The mementos you gathered are the only thing keeping you on this side of the ledge.

**▶ Play: [torresdelsisal.noofficelocation.com](https://torresdelsisal.noofficelocation.com)**

## How to play

| Key | Action |
| --- | --- |
| `W A S D` | Move |
| `Shift` | Run (drains *aliento* / breath) |
| Mouse | Look |
| `F` | Flashlight — freezes the shadows, drains battery |
| Click | Fire holy water — dissolves a ghost |
| `E` | Hide in a wardrobe |
| `Space` | On the rooftop: hold on — resist the jump |

- **Posesión (dread)** rises near ghosts and windows. At 100% you're dragged up a floor.
- **Recuerdos (mementos):** one per floor, floors 1–6. Each collected memento slows the temptation on the rooftop and becomes a lifeline (♥) that catches you once at the edge.
- **Amuleto** purges possession · **Agua bendita** dissolves ghosts · the phone (rooftop only) calls the rescue.
- The *espantos*: La Sayona, La Llorona, El Silbón, los duendes, la Bola de Fuego — each hunts differently.

## Tech

`index.html` plus a locally vendored `three.min.js` — no build step, framework, or bundler. Core gameplay uses no network and stays playable offline. Optional run records load a pinned Supabase JavaScript client from an ESM CDN only after a player opts in and supplies valid local configuration. Rendering is [Three.js](https://threejs.org/) r128 (MIT, served from the repo so it can't break on a CDN or SRI hiccup); all sound is synthesized live with the Web Audio API.

Originally prototyped in [Claude Design](https://claude.ai/design) (see `project/` for the original handoff bundle) and rebuilt as a standalone game.

## Project layout

```
public/            # everything that gets deployed
  index.html       # the whole game
  game-rules.mjs   # pure difficulty rules, independent of Three.js and the DOM
  runtime-metrics.mjs # bounded local frame-time and renderer metrics
  run-records.mjs  # opt-in, session-only Supabase records adapter
  supabase-config.example.js # local setup template; real config is ignored
  three.min.js     # vendored Three.js r128 (MIT)
  _headers         # Cloudflare cache rules (no-store on HTML)
.github/workflows/ # auto-deploy on push to main
deploy.sh          # one-command manual deploy
tests/             # Node built-in tests and architecture fitness checks
project/           # original Claude Design handoff bundle (reference only)
supabase/migrations/ # local SQL migrations; no remote project is linked
```

## Run locally

```bash
cd public && python3 -m http.server 8000
# open http://localhost:8000
```

Any static file server works. Pointer lock and Web Audio require serving over `http://`/`https://` (not `file://`) in some browsers.

## Deploy & versioning

Hosted on [Cloudflare Pages](https://pages.cloudflare.com/), project `torres-del-sisal`.

- **Automatic:** every push to `main` triggers `.github/workflows/deploy.yml`, which stamps the commit short-SHA into the build (visible on the intro screen and in the console as `[TDS] build …`) and deploys `public/`. Requires two repo secrets: `CLOUDFLARE_API_TOKEN` (a token with *Pages → Edit*) and `CLOUDFLARE_ACCOUNT_ID`.
- **Manual:** `./deploy.sh` does the same thing from your machine (uses your local `wrangler` login).
- **No stale builds:** `public/_headers` serves the HTML with `Cache-Control: no-store`, so browsers always fetch the current shell; the vendored `three.min.js` is cached `immutable`. Cloudflare keeps a full history of deployments — roll back to any previous build from the Pages dashboard.

Every deployment is content-addressable at `https://<hash>.torres-del-sisal.pages.dev`; the production alias (`torres-del-sisal.pages.dev` and any attached custom domain) always serves the latest.

## Tests & performance

Open the game with **`?test`** (e.g. `torres-del-sisal.noofficelocation.com/?test`) to run the built-in self-test harness: it asserts the core state machine (per-floor structure, phone-only-on-rooftop, mementos, targeting, temptation clamp, ascension, difficulty configs) plus regression guards (no PBR materials, no per-entity lights) and a render micro-benchmark, then shows a pass/fail report.

The renderer is tuned for a wide range of hardware without changing the look: lit surfaces use matte Phong instead of PBR, self-lit shapes use unlit materials, per-frame heap allocation is eliminated, HUD DOM writes are diffed, and an adaptive-resolution scaler *only* lowers pixel density on devices that can't hold ~50fps (capable hardware always renders at full). Measured result: interior render time dropped ~5× (6.3 ms → 1.1 ms/frame at retina resolution).

Run the pure rules and architecture checks with Node, without installing dependencies:

```bash
node --test tests/*.test.mjs
```

`public/game-rules.mjs` and `public/runtime-metrics.mjs` must remain free of imports and browser, Three.js, network, or storage APIs. The architecture fitness test enforces this boundary.

Append `?metrics` to the game URL to opt into local diagnostics. The console reports frame-time p50/p95/p99 in milliseconds, average FPS, draw calls, and Three.js geometry/texture counts every five seconds. It keeps at most 300 frame intervals in memory; it makes no network requests and stores no data. Treat p95 frame time above 20 ms or average FPS below 50 as a local investigation signal, not a CI failure. Draw-call, geometry, and texture counts are observations rather than universal thresholds because procedural floors have different scene contents. Metrics are omitted unless the query parameter is present.

Optional Supabase run records, their local setup, data model, and provider-log caveats are documented in [`SUPABASE_RUN_RECORDS.md`](SUPABASE_RUN_RECORDS.md).

---

*Contenido de terror. Usa audífonos.*

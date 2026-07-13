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

A single self-contained `index.html` — no build step, no framework, no bundler. Rendering is [Three.js](https://threejs.org/) (r128, pinned with Subresource Integrity); all sound is synthesized live with the Web Audio API. It runs anywhere a modern browser and a keyboard + mouse are available.

Originally prototyped in [Claude Design](https://claude.ai/design) (see `project/` for the original handoff bundle) and rebuilt as a standalone game.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Any static file server works. Pointer lock and Web Audio require serving over `http://`/`https://` (not `file://`) in some browsers.

## Deploy

Static site — deploys to [Cloudflare Pages](https://pages.cloudflare.com/) (or any static host). The whole game is `index.html`.

---

*Contenido de terror. Usa audífonos.*

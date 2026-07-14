# Spectral Entity Redesign — Design Spec

**Date:** 2026-07-14
**Project:** Torres del Sisal (single self-contained `public/index.html`, Three.js r128)
**Goal:** Make the six entities dramatically more detailed, folklore-accurate, and *alive* — without external assets, without losing the dark/foggy painterly tone, and without giving back the performance we just gained.

## Direction (decided during brainstorming)

- **Realism style:** richer procedural + folklore-accurate — NOT photoreal textures, NOT an art-style pivot. Detail comes from better geometry, spectral shading, and motion, all procedural and self-contained.
- **Scope:** all six entities — La Sayona, El Silbón, La Llorona, Sombra, Duende, Bola de Fuego.
- **Animation:** fully animated (flowing cloth/hair, drift, reach, reveal face, churning fire).
- **Build approach:** shader-driven spectral procedural for all six, **plus** procedural `CanvasTexture` faces for the two face moments only (La Sayona's reveal, El Silbón).
- **Constraint:** behavior/AI is unchanged. This is a **visual + animation** change only. `_updateEntities` gameplay logic (targeting, catch radius, speeds, states, audio, dread) stays as-is; only the meshes, materials, and a thin per-frame animation hook change.

## Non-goals

- No external image/model/texture files. Everything procedural, generated at runtime, cached.
- No change to entity hitboxes, speeds, spawn plans, or AI states.
- No re-enabling per-entity point lights or `MeshStandardMaterial` (would fail existing `?test` perf guards).
- No new build step. Still one hand-editable HTML file + vendored `three.min.js`.

## Architecture

### Shared toolkit (new helpers on the `Game` class)

**`_spectral` uniforms (one shared object):**
```
this._spectral = { time: { value: 0 } }   // a single shared THREE uniform, updated once/frame
```

**`_spectralMat(opts)` → material**
Returns a `MeshPhongMaterial` (matte, `specular:0x000000`, keeps the existing cheap look) patched via `onBeforeCompile` to inject three GPU effects. Tagged `material.userData.spectral = true` and `material.userData.keep = true` (cached, not disposed per floor).

- **Vertex sway** (vertex shader, patched into `#include <begin_vertex>`): displaces X/Z by `sin(worldPhase + uTime*speed) * amp * heightFactor`, where `heightFactor` grows from 0 at the anchor height toward the swaying edge (hem/tatters/hair tips). Params: `swayAmp`, `swaySpeed`, `swayAxisFromY` (anchor). Cloth ripples, roots stay put.
- **Fresnel rim glow** (fragment shader, patched near the end / after lighting): `rim = pow(1.0 - max(dot(N, V), 0.0), rimPower); outgoingLight += rimColor * rim * rimStrength;` — edges glow in the entity's accent color. This is the primary "spectral" cue and is cheaper than the removed PBR.
- **Hem opacity fade** (fragment shader, optional per material): `alpha *= smoothstep(hemBottom, hemTop, vWorldY)` so gowns/smoke dissolve toward the bottom. Requires `transparent:true`, `depthWrite:false` on those materials.

`opts`: `{ color, emissive?, emissiveIntensity?, swayAmp?, swaySpeed?, swayAnchorY?, rimColor?, rimStrength?, rimPower?, hem?: {bottom, top}, transparent?, opacity? }`. All effects are opt-in via opts (a wall never uses this; only entities do).

**`_lathePart(profilePoints, segments, mat)` → Mesh**
Builds a `LatheGeometry` from an array of `THREE.Vector2` profile points (radius, height) for flowing gowns/robes/veils. Cheap, elegant silhouettes vs. plain cylinders.

**`_faceTexture(kind)` → CanvasTexture (cached)**
Draws a face to an offscreen canvas once and caches it. Kinds: `sayonaCalm`, `sayonaTrue` (hollow eyes, gaping fanged mouth), `silbon` (gaunt, sunken). Applied to a small forward-facing plane or the head's front face with `transparent:true`. Cached in `this._faceTex[kind]`.

**Per-type caches:** `this._entGeo = {}`, `this._entMat = {}`. Geometry and materials for each entity type are built once (lazily, on first spawn) and reused across all spawns and floors, tagged `keep` so `_disposeGroup` won't free them (same pattern as the instanced critters). This removes the per-spawn allocation flagged in the perf review.

### Per-frame animation hook

A single `_animateEntities(now)` called once per frame from `_frame` (after `_updateEntities`), which:
1. Sets `this._spectral.time.value = now * 0.001` (drives all sway/flicker on the GPU).
2. For each live entity, applies **group-level** motion the shader can't: idle float (`sin`), subtle breathing (scale), directional drift, La Llorona's arm-reach lerp when `state==='hunt'`, head tilt, and advances La Sayona's `revealT` toward its target with a crossfade of the two face textures + jaw-drop.

CPU cost: a few transforms per entity for ≤ ~5 entities — negligible. All cloth/fire motion is on the GPU.

### Entity state object

Unchanged shape for AI. New optional fields the animation hook uses: `revealT` (0→1), `reachT`, and references to animated sub-parts (`e.jaw`, `e.arms`, `e.face`, `e.faceTrue`) where relevant. `eyes` array stays (existing eye-flare tell).

## The six entities

| Entity | Silhouette / lore | Key new detail | Animation |
|---|---|---|---|
| **La Sayona** | white woman, long black hair, monstrous true face | lathe gown w/ hem-fade; hair strands; `CanvasTexture` face | gown ripple, hair sway, drift; **reveal**: face crossfade calm→true + jaw drop + eyes flare red |
| **El Silbón** | very tall gaunt spectre, hat, sack of bones | elongated tapered body; wide-brim hat; lumpy sack; tattered hem; gaunt shadowed face texture | tatters + sack sway, slow lurch/drift |
| **La Llorona** | weeping veiled woman, reaching | trailing rippling veil + lathe gown; bowed head; reaching arms; cyan wet rim | veil ripple, **arms extend toward player when hunting**, hem dissolve |
| **Sombra** | shadow-flesh wraith, red eyes | tapered form, lower half dissolves to smoke (strong sway + hem-fade), dark rim | smoke sway, drift; eyes flare on hunt/lunge |
| **Duende** | small gnarled goblin, red hat | hunched body, oversized red cone hat, glowing yellow eyes, stubby limbs | scampering bob, small idle jitter |
| **Bola de Fuego** | churning fireball | layered emissive spheres, noise-displaced surface, additive halo, trailing embers | surface churn (vertex noise), emissive flicker, ember drift |

**Readability (playability) rule:** each entity must keep its instantly-recognizable silhouette + accent color + gameplay tell (glowing eyes, whistle/sob/giggle audio, Sayona announce/reveal, flashlight-freezes-Sombra). Detail is added *within* the existing silhouette, never replacing the tell.

## Performance budget & guardrails

- **Triangles:** target < ~12k total for all on-screen entities (today ~1k). Trivial for any GPU.
- **Shaders:** sway + fresnel run on the GPU; one shared `uTime`. Net per-fragment cost stays below the PBR path we removed.
- **Transparency:** only ghostly shells (gown hems, smoke) are transparent, with `depthWrite:false`; bounded to the 1–4 entities on screen so overdraw stays small.
- **Allocation:** geometry + materials cached per type, reused across floors/spawns (tagged `keep`). No per-spawn allocation.
- **Measured ceiling:** interior render time (readPixels bench, retina, stress view) must stay **within ~1.5× of current (~1.1ms → ≤ ~1.7ms)**. If a specific entity blows the budget, simplify its geometry/transparency before shipping.
- **`?test` guards stay green:** no `MeshStandardMaterial` in the scene, no per-entity point lights.

## Testing

Extend the `?test` self-test harness:
- Each entity type builds without exception and adds a group to the floor.
- Every entity material is spectral/Phong (`userData.spectral` present) — assert **zero `MeshStandardMaterial`** among entity meshes (reinforces the global no-PBR guard).
- No entity group contains a `PointLight` (existing guard, extended per type).
- Per-type geometry/material caches populate and are reused (second spawn reuses the same geometry object).
- La Sayona exposes a reveal path: advancing `revealT` to 1 swaps/crossfades to the true face without error.
- Render micro-bench stays under budget (e.g. `< 2.5ms/frame` in the harness environment).

Visual validation (manual, during implementation): prototype each entity, screenshot it in-game at close and mid range in fog, confirm the silhouette reads and the tell is visible. Real in-game renders are the source of truth (low-poly 3D mockups would mislead).

## Success criteria

1. All six entities visibly more detailed and lore-accurate, animated (cloth/hair/fire/reach/reveal).
2. Aesthetic and mood preserved — recognizable at a glance, still dark/foggy/painterly.
3. Gameplay unchanged: same behavior, hitboxes, tells, audio.
4. Self-contained: no external assets, no build step.
5. Performance within the stated ceiling; `?test` all green.

## Rollout

Implement behind the existing structure incrementally — shared toolkit first, then one entity at a time (Sombra → Duende → Silbón → Llorona → Sayona → Bola, simplest-first), screenshotting each, so a regression is caught per-entity rather than all at once. Ship via the existing auto-deploy pipeline once all six pass `?test` and visual review.

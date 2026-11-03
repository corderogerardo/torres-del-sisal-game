# Visual Realism — Plan

Objective: make Torres del Sisal read as a real, human place instead of flat-colored geometry, without a build step, external asset files, PBR, per-entity lights, or breaking the 8 ms render budget.

Branch: `feat/visual-realism`. Delivery: stacked-to-main, work-unit commits. Runner: `node --test tests/*.test.mjs`; browser proof: `node scripts/playthrough.mjs` and `?test`.

## Findings (investigation, 2026-11-03)

- Materials: `_mat()` builds `MeshPhongMaterial` with `specular: 0x000000, shininess: 0`, i.e. fully matte and untinted per surface. No `map`, no `bumpMap`. Walls, floors and props are single flat colors from `THEMES` (`public/config.mjs`).
- Entities (`public/bestiary.mjs`): humanoids are one `LatheGeometry` gown plus a sphere head. No neck, shoulders, arms, hands, jaw, or clothing folds. Faces are flat planes with a `CanvasTexture`; eyes on the shadows/duende are emissive spheres.
- Lighting: one `HemisphereLight` (0.4) and one `DirectionalLight` (0.4); per-prop point lights. No contact shadows, so nothing appears grounded.
- Guardrails from `?test` that must stay green: no `MeshStandardMaterial` in the scene; entities carry no point lights; entities use the spectral material; Sayona reveal keeps both face planes.
- Budget: render micro-benchmark must stay under 8 ms/frame. Current baseline is roughly 0.3 ms, so there is headroom but draw calls are the risk.

## Specs

- S1 — User request (verbatim): "can we find a way to improve game realism, I want the game to look more human real, maybe by making the game assets with a tool or skill, you can investigate, create a plan and lets improve the game realism, more human realism".
- S2 — World surfaces must show material detail (plaster, wood, tile, fabric) generated procedurally at runtime. No external image files, no network. Detail must be tintable per floor theme so `THEMES` stays the single source of palette.
- S3 — Humanoid entities must read as human at gameplay distance: neck, shoulders, upper/lower arms with a slight bend, hands, a jaw below the cranium, and cloth folds. Keep the existing spectral material and the Sayona reveal contract.
- S4 — Grounding and depth: every entity and major prop casts a soft contact shadow; lighting gains gentle roll-off. No per-entity lights, no PBR.
- S5 — Verification: `?test` stays 65/65 with render under 8 ms; `node --test tests/*.test.mjs` stays green; `node scripts/playthrough.mjs` stays 5/5; before/after screenshots captured from the same camera pose.

## Tasks

- T1 (S2) — New `public/textures.mjs`: deterministic procedural detail maps (grayscale, tinted by material color) for plaster, wood, tile and fabric, plus matching bump maps. Pure module with an injected canvas factory, no imports. **done** — `tests/textures.test.mjs` 6/6.
- T2 (S2) — Wire the texture factory into `_mat()` and the floor builder so walls, floors, ceilings and large props use detail plus bump, keeping `specular: 0` matte. **done** — walls `plaster` 3x1, floor `wood` 8x8, ceiling `plaster` 3x3, props `wood` 3x2.
- T3 (S3) — Humanoid anatomy in `public/bestiary.mjs`: neck, shoulders, bent arms, hands, jaw, gown folds; shared cached geometries. **done** — distinct skin material for head/jaw/hands.
- T4 (S4) — Contact shadows for entities and props, and a gentle tone-mapping/exposure pass. **done** for shadows; tone mapping skipped to avoid shifting the established palette.
- T5 (S5) — Screenshot comparison, suite, playthrough, `?test`, render timing. **done** — see L3.

## Log

- L1 (user verbatim): "can we find a way to improve game realism, I want the game to look more human real, maybe by making the game assets with a tool or skill, you can investigate, create a plan and lets improve the game realism, more human realism"
- L2 (investigation): baseline screenshot at floor 1 shows a fogged gray corridor with no readable surface material. Entities are silhouette lathes. Detail is the gap, not resolution or frame rate.
- L3 (evidence, 2026-11-03): `?test` 65/65 at 0.31 ms/frame (budget 8 ms); `node --test tests/*.test.mjs` 220/220; `node scripts/playthrough.mjs` 5/5. Studio turnaround (set hidden, fog off) before vs after: baseline Sayona is a teardrop lathe with a floating sphere head; after, it has head, neck, shoulders, bent arms, hands, jaw and a flared gown, plus a contact shadow in game.
- L4 (decision): textures are procedural rather than generated image assets. Reasons: seamless tiling is guaranteed by construction, they cost no repository weight, they are deterministic, and they keep the no-external-assets, offline-first model. An image model would need manual tiling fixes and 1-4 MB of binary assets.

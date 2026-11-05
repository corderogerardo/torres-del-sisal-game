# Visual and Audio References for Spectral Realism

Research date: 2026-11-03. These sources guide original stylized game assets; they are not packaged as game media. Folklore is oral and regional, so a source documents one account, not a universal character sheet.

## Venezuelan folklore

### Fundación Empresas Polar — *Mitos y leyendas del estado Portuguesa*

[Book record and contents](https://bibliofep.fundacionempresaspolar.org/publicaciones/libros/mitos-y-leyendas-del-estado-portuguesa), Carmen Pérez Montero, Fundación Empresas Polar, ISBN 978-980-379-348-7, 159 pages. The publisher describes the book as recent oral testimonies collected across Portuguesa and lists chapters for [El Silbón](https://bibliofep.fundacionempresaspolar.org/media/1377934/mitos_portuguesa_c_01_el-silbon.pdf), [Los duendes](https://bibliofep.fundacionempresaspolar.org/media/1377951/mitos_portuguesa_c_18_los-duendes.pdf), [La Llorona o la Gritona](https://bibliofep.fundacionempresaspolar.org/media/1377960/mitos_portuguesa_c_27_la-llorona.pdf), and [La Sayona](https://bibliofep.fundacionempresaspolar.org/media/1377961/mitos_portuguesa_c_28_la-sayona.pdf).

The research scout's reading of the chapter excerpts found these local motifs:

- **El Silbón:** a witness describes an extraordinarily tall figure—knees above his head—and a distinctive whistle. A thin, elongated silhouette is supported by this account. It does not specify a canonical melody, pitch, hat, or sack.
- **La Sayona:** a beautiful woman in a white *saya*, with long fangs and fiery eyes when revealed. The white gown and an unsettling reveal are source-backed cues; exact anatomy and face are not canonical.
- **La Llorona / La Gritona:** accounts describe a woman or shadow associated with a piercing cry; one account describes a skeletal transformation. Keep this Portuguese/llanero variant distinct from generalized or Mexican depictions.
- **Duendes:** an account ties them to children who died unbaptized, but provides no stable body shape. The game's small red-hatted figure is a creative choice, not an established physical description.

The linked chapters are the primary regional source. Direct PDF fetching returned an unsupported content-type in this research environment; the design cues above are reported from the research scout's reading of the chapter excerpts, not claimed as independently re-read quotations. The publisher's HTML page itself verifies the book metadata, oral-testimony framing, and chapter titles.

## Visual references and reuse terms

- [El Silbón Venezolano.jpg](https://commons.wikimedia.org/wiki/File:El_Silb%C3%B3n_Venezolano.jpg) — a photographed statue/interpretation, not a historical or canonical depiction. Commons lists photographer/uploader Neotours and **CC BY-SA 4.0**. Reuse requires attribution and share-alike; do not import it into the game without satisfying those terms.
- [La Sayona.jpg](https://commons.wikimedia.org/wiki/File:La_Sayona.jpg) — a photographed statue in the Venezuelan Llanos, not a canonical image. Commons lists Neotours and **CC BY-SA 4.0**. Same attribution/share-alike obligations.
- [Henrique Capriles 2022.jpg](https://commons.wikimedia.org/wiki/File:Henrique_Capriles_2022.jpg) — Commons lists uploader SantanaZ and **CC0 1.0** for copyright, but also displays a personality-rights warning. It is a limited visual reference for a generic visitor's age/clothing proportions only, not permission to reproduce Capriles's exact face or imply endorsement.
- The earlier [Capriles/Manguanguas research](capriles-manguanguas.md) records no canonical meme image or originator. Meme mashups are not source images.

## Audio references

- [Freesound: LlanosVenezolanos_Amanecer_Aves.wav](https://freesound.org/people/almaclararadharani/sounds/502206/) and [LlanosVenezolanos_Finca_Animales.wav](https://freesound.org/people/almaclararadharani/sounds/502205/) — the research scout reports uploader metadata describing Zoom H4-N field recordings and CC BY 4.0. The Freesound pages returned HTTP 503 when independently fetched here, so neither the sound contents nor license could be re-verified. Treat these as leads only; re-check page metadata and attribution before reuse.
- [A Harper for Harmony: Joropo](http://www.harpingforharmony.org/joropo) describes live/performance recordings with Llanos musicians from Guanare, Barinas, and Cojedes (2006–2011). Useful for real harp/cuatro/maracas performance and rhythmic reference; no reuse license was found, so do not embed or sample it.
- [PBS Monstrum: “El Silbón: The Deadly Whistler of the Grasslands”](https://www.pbs.org/video/el-silbon-the-deadly-whistler-of-the-grasslands-fdpxj8) (2021-07-21) is an educational retelling and produced sound design, not a field recording. PBS marks its media all-rights-reserved; it may guide narrative timing only, not provide an audio asset.

There is no reliable recording of a supernatural Silbón whistle. A real recording can document a human whistle, livestock, birds, wind, or regional music; it cannot establish a ghost sound. Any in-game whistle remains original sound design.

## Capriles / Manguanguas

- [Henrique Capriles's public X post](https://x.com/hcapriles/status/2095546875650732100) (2026-09-03) directly supports the “house to house,” listening/talking, and host-offered-coffee motifs. It does not support a supernatural appearance, forced entry, or coffee theft.
- [Cazadores de Fake News fact-check](https://www.cazadoresdefakenews.info/video-de-capriles-sin-camisa-y-con-sombrero-de-pirata-creado-con-ia/) identifies the shirtless pirate-hat clip as an AI-generated manipulation of real footage. Exclude it entirely as a visual or voice reference.
- Preserve the existing design: a fictional spectral visitor carrying coffee, with generic stylized features. Do not clone Capriles's voice or reproduce his photo-real face.

## Game-design use

1. Use the Portuguesa accounts for distinct silhouettes and gestures, while labeling unsupported features (duende hat, Silbón sack/hat) as creative design rather than folk fact.
2. Use source images and performance recordings as private visual/acoustic references only. No binaries, remote loading, or voice imitation are added by this research.
3. For sound, use measured qualities—distant whistle, dry grasses/wind, birds/livestock, harp/cuatro/maracas rhythm—to inform original procedural synthesis. Do not present dramatized audio as an authentic paranormal recording.

## Renderer implementation reference

The game vendors Three.js r128, so versioned source is more authoritative here than current `dev` documentation:

- [`WebGLShadowMap.js` at r128](https://github.com/mrdoob/three.js/blob/r128/src/renderers/webgl/WebGLShadowMap.js) defaults the shadow type to `PCFShadowMap`, returns early if `renderer.shadowMap.enabled` is false, and traverses visible scene meshes marked `castShadow` during the shadow pass.
- [`WebGLRenderer.js` at r128](https://github.com/mrdoob/three.js/blob/r128/src/renderers/WebGLRenderer.js) invokes that shadow pass on each normal render, before the color pass. Thus every extra caster adds shadow-pass work every frame while auto-update is on.
- [`LightShadow.js` at r128](https://github.com/mrdoob/three.js/blob/r128/src/lights/LightShadow.js) initializes a 512 × 512 map; map size and camera bounds can be tuned per light. Avoid enabling `castShadow` for every clutter object.
- Context7's current Three.js docs warn that `PCFSoftShadowMap` was removed from newer WebGL releases. That warning is not a version-correct reason to reject r128's `PCFShadowMap`; verify the vendored revision first.

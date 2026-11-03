// Procedural surface detail for the tower's world geometry.
//
// Every wall, floor and prop in the game is a flat, untinted MeshPhongMaterial, so
// plaster, wood and cloth all read as the same matte colour. Shipping image files
// would add downloads, cache rules and a build step, so this module derives neutral
// grayscale fields in-process instead: the caller uploads them to a canvas texture
// and the renderer multiplies them by the floor theme colour, which keeps THEMES the
// single source of palette.
//
// It is deliberately free of DOM, renderer and network APIs -- pixels are numbers
// here. Output is a pure function of (kind, size, seed): the same arguments always
// produce byte-identical bytes, and different seeds produce different detail.

const DESIGN_LUMA = 0.85; // neutral albedo level; theme tinting may only darken it
const TAU = Math.PI * 2;
const MIN_SIZE = 32;
const MAX_SIZE = 1024;

export const TEXTURE_KINDS = Object.freeze(new Set(['plaster', 'wood', 'tile', 'fabric']));

const BUMP_GAIN = Object.freeze({ plaster: 2.6, wood: 2, tile: 1.1, fabric: 1.8 });

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mixSeed(seed, salt) {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  return (h ^ (h >>> 16)) >>> 0;
}

// Lattice period: the largest power of two not above the wanted cell count. Powers of
// two let the wrap-around use a mask instead of a modulo inside the pixel loop.
function periodFor(cells, size) {
  const limit = Math.max(2, Math.min(cells, size));
  let period = 2;
  while (period * 2 <= limit) period *= 2;
  return period;
}

function stack(rand, size, spec) {
  return spec.map(([cellsX, cellsY]) => {
    const px = periodFor(cellsX, size);
    const py = periodFor(cellsY, size);
    const values = new Float32Array(px * py);
    for (let i = 0; i < values.length; i++) values[i] = rand();
    return { values, px, py, maskX: px - 1, maskY: py - 1 };
  });
}

// Periodic value noise: lattice indices wrap, so the field repeats exactly at the edges.
function sample(layer, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const cx0 = x0 & layer.maskX;
  const cy0 = y0 & layer.maskY;
  const cx1 = (cx0 + 1) & layer.maskX;
  const cy1 = (cy0 + 1) & layer.maskY;
  const cells = layer.values;
  const top = cells[cy0 * layer.px + cx0] + (cells[cy0 * layer.px + cx1] - cells[cy0 * layer.px + cx0]) * sx;
  const bottom = cells[cy1 * layer.px + cx0] + (cells[cy1 * layer.px + cx1] - cells[cy1 * layer.px + cx0]) * sx;
  return top + (bottom - top) * sy;
}

function fbm(layers, u, v) {
  let sum = 0;
  let total = 0;
  let weight = 1;
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    sum += weight * sample(layer, u * layer.px, v * layer.py);
    total += weight;
    weight *= 0.5;
  }
  return sum / total;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Low-frequency mottling plus fine grain, damp patches and faint vertical streaks.
function plasterAt(values, size, seed) {
  const rand = mulberry32(mixSeed(seed, 1));
  const mottle = stack(rand, size, [[4, 4], [8, 8], [16, 16]]);
  const grain = stack(rand, size, [[128, 128]]);
  const damp = stack(rand, size, [[2, 2], [4, 4]]);
  const streak = stack(rand, size, [[24, 2]]);

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const wet = smoothstep(0.55, 0.9, fbm(damp, u, v));
      values[y * size + x] =
        DESIGN_LUMA + (fbm(mottle, u, v) - 0.5) * 0.13 + (fbm(grain, u, v) - 0.5) * 0.05 +
        (fbm(streak, u, v) - 0.5) * 0.015 - wet * 0.07;
    }
  }
}

// Grain runs along X: noise stretched horizontally, wavy rings along Y, dark knots.
function woodAt(values, size, seed) {
  const rand = mulberry32(mixSeed(seed, 2));
  const stretch = stack(rand, size, [[2, 32], [4, 64]]);
  const warp = stack(rand, size, [[4, 4], [8, 8]]);
  const pores = stack(rand, size, [[128, 128]]);
  const knotCount = 2 + Math.floor(rand() * 2);
  const knots = [];
  for (let i = 0; i < knotCount; i++) {
    knots.push({
      x: rand(),
      y: rand(),
      radius: 0.035 + rand() * 0.05,
      squash: 0.45 + rand() * 0.35,
    });
  }
  const rings = Math.max(6, Math.round(size / 14));

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const bend = (fbm(warp, u, v) - 0.5) * 0.6;
      const grain = 0.5 + 0.5 * Math.cos(TAU * (v * rings + bend));
      let knot = 0;
      for (let k = 0; k < knots.length; k++) {
        const spec = knots[k];
        let dx = Math.abs(u - spec.x);
        if (dx > 0.5) dx = 1 - dx;
        let dy = Math.abs(v - spec.y);
        if (dy > 0.5) dy = 1 - dy;
        const ry = spec.radius * spec.squash;
        const d = (dx * dx) / (spec.radius * spec.radius) + (dy * dy) / (ry * ry);
        if (d < 1) knot = Math.max(knot, (1 - d) * (1 - d) * 1.6);
      }
      values[y * size + x] =
        DESIGN_LUMA + (grain - 0.5) * 0.13 + (fbm(stretch, u, v) - 0.5) * 0.06 +
        (fbm(pores, u, v) - 0.5) * 0.03 - Math.min(knot, 1) * 0.2;
    }
  }
}

// Grout grid offset by half a tile so the seam falls inside a tile, not on a joint.
function tileAt(values, size, seed) {
  const rand = mulberry32(mixSeed(seed, 3));
  const grit = stack(rand, size, [[64, 64], [128, 128]]);
  const grime = stack(rand, size, [[16, 16], [32, 32]]);
  const tiles = 4;
  const mask = tiles - 1;
  const grout = 0.028;
  const shade = new Float32Array(tiles * tiles);
  for (let i = 0; i < shade.length; i++) shade[i] = rand() - 0.5;

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    const cy = v * tiles + 0.5;
    const iy = Math.floor(cy);
    const dy = Math.min(cy - iy, 1 - (cy - iy));
    const rowShade = (iy & mask) * tiles;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const cx = u * tiles + 0.5;
      const ix = Math.floor(cx);
      const dx = Math.min(cx - ix, 1 - (cx - ix));
      const edge = Math.min(dx, dy);
      const groove = 1 - smoothstep(grout * 0.45, grout, edge);
      const chamfer = 1 - smoothstep(grout, grout * 3.2, edge);
      values[y * size + x] =
        DESIGN_LUMA + shade[rowShade + (ix & mask)] * 0.055 - groove * 0.2 - chamfer * 0.035 +
        (fbm(grit, u, v) - 0.5) * chamfer * 0.055 + (fbm(grime, u, v) - 0.5) * groove * 0.05;
    }
  }
}

// Plain weave: alternating warp and weft highlights over low-frequency fold shading.
function fabricAt(values, size, seed) {
  const rand = mulberry32(mixSeed(seed, 4));
  const folds = stack(rand, size, [[2, 2], [4, 4], [8, 8]]);
  const slub = stack(rand, size, [[64, 64]]);
  const threads = Math.max(8, 2 * Math.round(size / 8)); // even, so the weave parity wraps

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    const ty = v * threads + 0.5;
    const iy = Math.floor(ty);
    const fy = ty - iy;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const tx = u * threads + 0.5;
      const ix = Math.floor(tx);
      const fx = tx - ix;
      const warp = 1 - 2 * Math.abs(fx - 0.5);
      const weft = 1 - 2 * Math.abs(fy - 0.5);
      const thread = ((ix + iy) & 1) === 0 ? warp : weft;
      values[y * size + x] =
        DESIGN_LUMA + (fbm(folds, u, v) - 0.5) * 0.09 + (fbm(slub, u, v) - 0.5) * 0.035 +
        (thread - 0.5) * 0.075;
    }
  }
}

const BUILDERS = Object.freeze({ plaster: plasterAt, wood: woodAt, tile: tileAt, fabric: fabricAt });

function field(kind, size, seed) {
  if (!TEXTURE_KINDS.has(kind)) {
    throw new RangeError(`textures: unknown kind ${String(kind)}`);
  }
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    throw new RangeError(`textures: size must be an integer from ${MIN_SIZE} to ${MAX_SIZE}, got ${String(size)}`);
  }
  const values = new Float32Array(size * size);
  BUILDERS[kind](values, size, Number.isFinite(seed) ? Math.trunc(seed) : 1);
  return { values, size, gain: BUMP_GAIN[kind] };
}

function pack({ values, size }, base, scale) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < values.length; i++) {
    const at = i * 4;
    const level = base + values[i] * scale;
    data[at] = level;
    data[at + 1] = level;
    data[at + 2] = level;
    data[at + 3] = 255;
  }
  return { width: size, height: size, data };
}

// Detail is plain luminance; the bump puts DESIGN_LUMA at mid-gray so 128 is neutral.
export function detailField({ kind, size = 256, seed = 1 } = {}) {
  return pack(field(kind, size, seed), 0, 255);
}

export function bumpField({ kind, size = 256, seed = 1 } = {}) {
  const built = field(kind, size, seed);
  const scale = built.gain * 255;
  return pack(built, 128 - DESIGN_LUMA * scale, scale);
}

export function createTextureSet({ kind, size = 256, seed = 1 } = {}) {
  const built = field(kind, size, seed);
  const scale = built.gain * 255;
  return { detail: pack(built, 0, 255), bump: pack(built, 128 - DESIGN_LUMA * scale, scale) };
}

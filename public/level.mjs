// Level-description seam: layout, search, placement, and collider/pickup
// queries live here. Pure ESM: no window, document, or THREE imports.
// Geometry flows through the injected createBox factory as plain data.

export const LEVEL_LAYOUTS = Object.freeze(new Set(['room']));

const DEFAULT_PAD = 0.9;
const DEFAULT_PICKUP_RADIUS = 1.6;

// Free-spot search constants, lifted verbatim from the old Game._findFreeSpot.
const SPOT_AREA_WIDTH = 38;
const RELAXED_SPAWN_DIST = 3;
const FALLBACK_SPAN = 8;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function toSpan(box) {
  if (!box || typeof box !== 'object') return null;
  const { x0, x1, z0, z1 } = box;
  if (!isFiniteNumber(x0) || !isFiniteNumber(x1) || !isFiniteNumber(z0) || !isFiniteNumber(z1)) {
    return null;
  }
  return Object.freeze({
    x0: Math.min(x0, x1),
    x1: Math.max(x0, x1),
    z0: Math.min(z0, z1),
    z1: Math.max(z0, z1),
  });
}

export function spotBlocked(x, z, blocked = {}) {
  const source = blocked && typeof blocked === 'object' ? blocked : {};
  const boxes = Array.isArray(source.boxes) ? source.boxes : [];
  const limit = isFiniteNumber(source.limit) ? source.limit : Infinity;
  const rawPad = source.pad === undefined ? DEFAULT_PAD : Number(source.pad);
  const pad = Number.isFinite(rawPad) ? rawPad : DEFAULT_PAD;
  if (!isFiniteNumber(x) || !isFiniteNumber(z)) return true;
  if (Math.abs(x) > limit || Math.abs(z) > limit) return true;
  for (const box of boxes) {
    const span = toSpan(box);
    if (!span) continue;
    if (x > span.x0 - pad && x < span.x1 + pad && z > span.z0 - pad && z < span.z1 + pad) {
      return true;
    }
  }
  return false;
}

// The old Game._spotBlocked treated non-finite coordinates as free; keep that
// contract so the search sequence is unchanged for a misbehaving rng.
function blockedAt(x, z, colliders, limit, pad) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  return spotBlocked(x, z, { boxes: colliders, limit, pad });
}

// Deterministic free-spot search: two rng calls per try, in x-then-z order.
// Does not register the result; the caller owns the placed list.
export function findFreeSpot({
  rng,
  colliders = [],
  placed = [],
  roomHalf = 19,
  spawn = { x: 0, z: -16 },
  area = 0.78,
  minDist = 4,
  spawnDist = 4.5,
  pad = 0.9,
  tries = 150,
  relaxedTries = 60,
  limit = roomHalf - 1.1,
} = {}) {
  if (typeof rng !== 'function') {
    throw new TypeError('findFreeSpot requires an rng function');
  }
  const sx = spawn.x;
  const sz = spawn.z;

  for (let i = 0; i < tries; i++) {
    const x = (rng() - 0.5) * SPOT_AREA_WIDTH * area;
    const z = (rng() - 0.5) * SPOT_AREA_WIDTH * area;
    if (Math.hypot(x - sx, z - sz) < spawnDist) continue;
    if (blockedAt(x, z, colliders, limit, pad)) continue;
    let ok = true;
    for (const entry of placed) {
      const px = entry.x !== undefined ? entry.x : entry[0];
      const pz = entry.z !== undefined ? entry.z : entry[1];
      if (Math.hypot(x - px, z - pz) < minDist) { ok = false; break; }
    }
    if (ok) return [x, z];
  }

  // Relaxed pass: only hard colliders matter, with a tighter pad and spawn ring.
  for (let i = 0; i < relaxedTries; i++) {
    const x = (rng() - 0.5) * SPOT_AREA_WIDTH * area;
    const z = (rng() - 0.5) * SPOT_AREA_WIDTH * area;
    if (Math.hypot(x - sx, z - sz) < RELAXED_SPAWN_DIST) continue;
    if (blockedAt(x, z, colliders, limit, pad * 0.7)) continue;
    return [x, z];
  }

  return [(rng() - 0.5) * FALLBACK_SPAN, (rng() - 0.5) * FALLBACK_SPAN];
}

function toPickup(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.id !== 'string' || entry.id.length === 0) return null;
  if (!isFiniteNumber(entry.x) || !isFiniteNumber(entry.z)) return null;
  const rawRadius = entry.radius === undefined ? DEFAULT_PICKUP_RADIUS : Number(entry.radius);
  const radius = Number.isFinite(rawRadius) && rawRadius > 0 ? rawRadius : DEFAULT_PICKUP_RADIUS;
  return { id: entry.id, x: entry.x, z: entry.z, radius, taken: false };
}

export function createLevel({ createBox, layout } = {}) {
  if (!layout || typeof layout !== 'object') return null;
  if (!LEVEL_LAYOUTS.has(layout.kind)) return null;
  const spans = [];
  if (Array.isArray(layout.colliders)) {
    for (const box of layout.colliders) {
      const span = toSpan(box);
      if (span) spans.push(span);
    }
  }
  const items = [];
  if (Array.isArray(layout.pickups)) {
    for (const entry of layout.pickups) {
      const item = toPickup(entry);
      if (item) items.push(item);
    }
  }
  if (typeof createBox === 'function') {
    for (const span of spans) createBox({ x0: span.x0, x1: span.x1, z0: span.z0, z1: span.z1 });
  }

  function collides(p, r = 0) {
    if (!p || typeof p !== 'object') return false;
    if (!isFiniteNumber(p.x) || !isFiniteNumber(p.z)) return false;
    const rawRadius = Number(r);
    const radius = Number.isFinite(rawRadius) ? rawRadius : 0;
    for (const span of spans) {
      if (p.x > span.x0 - radius && p.x < span.x1 + radius && p.z > span.z0 - radius && p.z < span.z1 + radius) {
        return true;
      }
    }
    return false;
  }

  function pickupAt(p) {
    if (!p || typeof p !== 'object') return null;
    if (!isFiniteNumber(p.x) || !isFiniteNumber(p.z)) return null;
    for (const item of items) {
      if (item.taken) continue;
      if (Math.hypot(p.x - item.x, p.z - item.z) < item.radius) {
        item.taken = true;
        return { id: item.id, x: item.x, z: item.z };
      }
    }
    return null;
  }

  function resolve(p, r = 0) {
    if (!p || typeof p !== 'object') return false;
    if (!isFiniteNumber(p.x) || !isFiniteNumber(p.z)) return false;
    const rawRadius = Number(r);
    const radius = Number.isFinite(rawRadius) ? rawRadius : 0;
    let moved = false;
    for (const span of spans) {
      const minx = span.x0 - radius;
      const maxx = span.x1 + radius;
      const minz = span.z0 - radius;
      const maxz = span.z1 + radius;
      if (p.x > minx && p.x < maxx && p.z > minz && p.z < maxz) {
        const dxl = p.x - minx;
        const dxr = maxx - p.x;
        const dzl = p.z - minz;
        const dzr = maxz - p.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) p.x = minx;
        else if (m === dxr) p.x = maxx;
        else if (m === dzl) p.z = minz;
        else p.z = maxz;
        moved = true;
      }
    }
    return moved;
  }

  return Object.freeze({ collides, pickupAt, resolve });
}

function defaultKeep(value) {
  return Boolean(value?.userData?.keep);
}

function disposeValue(value) {
  if (value && typeof value.dispose === 'function') value.dispose();
}

// Generic teardown for a scene subtree. Kept resources (shared geometries,
// materials, textures) opt out through userData.keep, mirroring _keepGeo.
export function disposeGroup(group, { keep = defaultKeep } = {}) {
  if (!group || typeof group !== 'object') return;
  if (typeof group.traverse !== 'function') return;
  const shouldKeep = typeof keep === 'function' ? keep : defaultKeep;
  group.traverse((node) => {
    if (!node || typeof node !== 'object') return;
    if (node.isInstancedMesh) disposeValue(node);
    if (node.geometry && !shouldKeep(node.geometry)) disposeValue(node.geometry);
    const material = node.material;
    if (material) {
      for (const item of Array.isArray(material) ? material : [material]) {
        if (item && !shouldKeep(item)) disposeValue(item);
      }
    }
  });
}

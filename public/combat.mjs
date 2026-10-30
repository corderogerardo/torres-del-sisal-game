// Pure aim-target selection. Shot consequences stay in Game.

export function selectAimTarget({
  cameraPosition,
  forward,
  entities = [],
  maxDistance = 13,
  minDot = 0.88,
  skipDelayed = false,
} = {}) {
  if (!cameraPosition || !forward || !Array.isArray(entities)) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const entity of entities) {
    if (!entity || !entity.pos) continue;
    if (skipDelayed && entity.delay !== undefined && entity.delay > 0) continue;

    const x = Number(entity.pos.x);
    const z = Number(entity.pos.z);
    const cx = Number(cameraPosition.x);
    const cz = Number(cameraPosition.z);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(cx) || !Number.isFinite(cz)) continue;

    const dx = x - cx;
    const dz = z - cz;
    const distance = Math.hypot(dx, dz);
    if (distance > maxDistance) continue;
    const dot = (Number(forward.x) * dx + Number(forward.z) * dz) / (distance || 1);
    if (dot > minDot && distance < bestDistance) {
      best = entity;
      bestDistance = distance;
    }
  }
  return best;
}

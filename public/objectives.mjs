// Pure pickup effects. Meshes, banners and audio stay in Game.

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function applyWardPickup({ dread = 0, timeLeft = 0, timeMax = 0 } = {}) {
  return {
    dread: Math.max(0, finite(dread, 0) - 60),
    timeLeft: Math.min(finite(timeMax, 0), finite(timeLeft, 0) + 120),
  };
}

export function applyPistolPickup({ ammo = 0, max = 8, add = 4 } = {}) {
  return { ammo: Math.min(finite(max, 8), finite(ammo, 0) + finite(add, 4)) };
}

export function applyMementoPickup({ dread = 0, damage = 10 } = {}) {
  return { dread: Math.max(0, finite(dread, 0) - finite(damage, 10)) };
}

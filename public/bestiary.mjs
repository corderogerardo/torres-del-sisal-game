const KINDS = ['sombra', 'sayona', 'llorona', 'silbon', 'duende'];

export const BESTIARY_KINDS = Object.freeze(new Set(KINDS));

export function createBestiary({ behaviors = {} } = {}) {
  const spawned = [];

  function route(entity, now, dt) {
    const behavior = behaviors[entity.kind];
    if (typeof behavior !== 'function') return;
    behavior(entity, now, dt);
  }

  function spawn(kind, x, z) {
    if (!BESTIARY_KINDS.has(kind)) {
      throw new RangeError(`unknown bestiary kind: ${kind}`);
    }
    const entity = {
      kind,
      x,
      z,
      state: {},
      tick(now, dt) {
        route(entity, now, dt);
      },
    };
    spawned.push(entity);
    return entity;
  }

  function tick(now, dt) {
    for (const entity of spawned) {
      route(entity, now, dt);
    }
  }

  return { spawn, tick };
}

export function createNullBestiary() {
  function spawn(kind, x, z) {
    return {
      kind,
      x,
      z,
      state: {},
      tick() {},
    };
  }

  function tick() {}

  return { spawn, tick };
}

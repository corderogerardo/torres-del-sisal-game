const KINDS = ['sombra', 'sayona', 'llorona', 'silbon', 'duende'];

export const BESTIARY_KINDS = Object.freeze(new Set(KINDS));

const ENTITY_FACTORIES = {
  sombra(x, z, pull) {
    return {
      state: 'hunt',
      phase: x * 0.7 + z * 0.3,
      breathe: { spd: 1.5, amp: 0.02 },
      speed: { hunt: 1.35 * pull, lunge: 2.25 * pull },
      catchRadius: 1.15,
      grace: 3,
      catchMessage: 'UNA SOMBRA TE POSEYÓ',
    };
  },
  sayona(x, z, pull, random) {
    return {
      state: 'idle',
      phase: x * 0.4 + z * 0.6,
      speed: { hunt: 2.55 * pull },
      catchRadius: 1.2,
      grace: 3,
      delay: 10 + random() * 14,
      calm: true,
      catchMessage: 'LA SAYONA TE ARRASTRÓ',
    };
  },
  llorona(x, z, pull) {
    return {
      state: 'patrol',
      phase: x * 0.5 + z * 0.8,
      speed: { patrol: 0.95, hunt: 2.7 * pull },
      senseRange: 5.5,
      catchRadius: 1.1,
      grace: 3,
      sobT: 1.5,
      catchMessage: 'LA LLORONA TE ACUNÓ',
    };
  },
  silbon(x, z, pull) {
    return {
      state: 'hunt',
      phase: x * 0.6 + z * 0.4,
      lurch: { spd: 1.1, amp: 0.028 },
      speed: { hunt: 1.5 * pull },
      catchRadius: 1.1,
      grace: 4,
      whistleT: 0.8,
      catchMessage: 'EL SILBÓN TE ECHÓ AL SACO',
    };
  },
  duende(x, z, pull) {
    return {
      state: 'patrol',
      phase: x * 0.9 + z * 0.5,
      breathe: { spd: 9, amp: 0.03 },
      speed: { patrol: 1.7, hunt: 3.1 * pull },
      senseRange: 8,
      catchRadius: 0.85,
      grace: 2,
      fleeT: 0,
      catchMessage: 'LA TORRE TE ARRASTRÓ',
    };
  },
};

const DEFAULT_VECTOR = (x = 0, y = 0, z = 0) => ({
  x,
  y,
  z,
  set(nextX, nextY, nextZ) {
    this.x = nextX;
    this.y = nextY;
    this.z = nextZ;
    return this;
  },
});

function visualParts(group, parts = {}) {
  return {
    group,
    eyes: parts.eyes ?? null,
    faceCalm: parts.faceCalm ?? null,
    faceTrue: parts.faceTrue ?? null,
    armReach: parts.armReach ?? null,
    jaw: parts.jaw ?? null,
  };
}

export function createBestiaryMeshFactory({
  THREE,
  getFloorGroup,
  getCaches,
  keepGeometry,
  spectralMaterial,
  material,
  lathe,
  faceTexture,
}) {
  if (!THREE) throw new TypeError('THREE is required');
  const helpers = { getFloorGroup, getCaches, keepGeometry, spectralMaterial, material, lathe, faceTexture };
  for (const [name, helper] of Object.entries(helpers)) {
    if (typeof helper !== 'function') throw new TypeError(`${name} must be a function`);
  }

  function addToFloor(group, x, z) {
    group.position.set(x, 0, z);
    getFloorGroup().add(group);
    return group;
  }

  const factories = {
    sombra(x, z) {
      const T = THREE, g = new T.Group(), [C, M] = getCaches();
      if (!M.sombra) M.sombra = spectralMaterial({color:0x121826,emissive:0x2c3a56,emissiveIntensity:1.1,transparent:true,opacity:.95,swayAmp:.075,swaySpeed:1.7,swayAnchorY:1.35,swayRange:1.6,rimColor:0x5a80b4,rimStrength:.55,rimPower:2.0,hem:{bottom:.02,top:1.05}});
      if (!C.sombra) C.sombra = keepGeometry(lathe([[.02,-.15],[.26,.2],[.42,.65],[.34,1.15],[.19,1.55],[.11,1.9]],16));
      if (!C.sombraHead) C.sombraHead = keepGeometry(new T.SphereGeometry(.24,12,12));
      if (!M.eyeRed) { M.eyeRed = material({color:0xE63946,emissive:0xE63946,emissiveIntensity:2.2}); M.eyeRed.userData.keep = true; }
      if (!C.eye) C.eye = keepGeometry(new T.SphereGeometry(.045,8,8));
      g.add(new T.Mesh(C.sombra,M.sombra));
      const head = new T.Mesh(C.sombraHead,M.sombra); head.position.y = 2.02; g.add(head);
      const eL = new T.Mesh(C.eye,M.eyeRed); eL.position.set(-.08,2.06,.22);
      const eR = eL.clone(); eR.position.x = .08; g.add(eL); g.add(eR);
      addToFloor(g,x,z);
      return visualParts(g,{eyes:[eL,eR]});
    },
    sayona(x, z) {
      const T = THREE, g = new T.Group(), [C, M] = getCaches();
      if (!M.sayonaGown) M.sayonaGown = spectralMaterial({color:0xe4ded0,emissive:0x45433a,emissiveIntensity:.4,transparent:true,opacity:.94,swayAmp:.08,swaySpeed:1.4,swayAnchorY:1.6,swayRange:2.0,rimColor:0xd0d6d8,rimStrength:.5,rimPower:2.2,hem:{bottom:.02,top:1.0}});
      if (!C.sayonaGown) C.sayonaGown = keepGeometry(lathe([[.03,-.1],[.26,.35],[.44,1.0],[.34,1.7],[.2,2.2],[.13,2.5]],18));
      if (!M.sayonaHair) M.sayonaHair = spectralMaterial({color:0x08090e,emissive:0x0c0c14,emissiveIntensity:.2,swayAmp:.05,swaySpeed:1.6,swayAnchorY:2.55,swayRange:1.5,rimColor:0x2a2438,rimStrength:.3,rimPower:2.6});
      if (!C.sayonaHair) C.sayonaHair = keepGeometry(lathe([[.14,2.6],[.3,2.1],[.29,1.4],[.16,.95]],14));
      if (!C.head20) C.head20 = keepGeometry(new T.SphereGeometry(.2,14,14));
      if (!C.faceP) C.faceP = keepGeometry(new T.PlaneGeometry(.3,.36));
      g.add(new T.Mesh(C.sayonaGown,M.sayonaGown));
      const head = new T.Mesh(C.head20,M.sayonaGown); head.position.y = 2.45; g.add(head);
      const faceCalm = new T.Mesh(C.faceP,new T.MeshBasicMaterial({map:faceTexture('sayonaCalm'),transparent:true})); faceCalm.position.set(0,2.46,.19); g.add(faceCalm);
      const faceTrue = new T.Mesh(C.faceP,new T.MeshBasicMaterial({map:faceTexture('sayonaTrue'),transparent:true,opacity:0})); faceTrue.position.set(0,2.46,.195); g.add(faceTrue);
      g.add(new T.Mesh(C.sayonaHair,M.sayonaHair));
      addToFloor(g,x,z); g.visible = false;
      return visualParts(g,{faceCalm,faceTrue});
    },
    llorona(x, z) {
      const T = THREE, g = new T.Group(), [C, M] = getCaches();
      if (!M.llorona) M.llorona = spectralMaterial({color:0xb8c0bb,emissive:0x333a34,emissiveIntensity:.5,transparent:true,opacity:.9,swayAmp:.07,swaySpeed:1.5,swayAnchorY:1.5,swayRange:1.9,rimColor:0x82b2b8,rimStrength:.55,rimPower:2.1,hem:{bottom:.02,top:1.1}});
      if (!C.llorona) C.llorona = keepGeometry(lathe([[.03,-.1],[.24,.3],[.4,.9],[.32,1.5],[.2,2.0],[.13,2.25]],16));
      if (!M.lloronaVeil) M.lloronaVeil = spectralMaterial({color:0xd6dad2,emissive:0x3a3e38,emissiveIntensity:.45,transparent:true,opacity:.7,swayAmp:.05,swaySpeed:1.9,swayAnchorY:2.3,swayRange:1.5,rimColor:0xa0d0d4,rimStrength:.5,hem:{bottom:.7,top:2.3},side:T.DoubleSide});
      if (!C.lloronaVeil) C.lloronaVeil = keepGeometry(lathe([[.1,2.35],[.32,1.95],[.44,1.35]],14));
      if (!C.head20b) C.head20b = keepGeometry(new T.SphereGeometry(.2,12,12));
      if (!C.arms) C.arms = keepGeometry(new T.SphereGeometry(.24,10,10));
      g.add(new T.Mesh(C.llorona,M.llorona));
      const head = new T.Mesh(C.head20b,M.llorona); head.position.set(0,2.15,.06); head.rotation.x = .5; g.add(head);
      g.add(new T.Mesh(C.lloronaVeil,M.lloronaVeil));
      const arms = new T.Mesh(C.arms,M.llorona); arms.position.set(0,1.75,.22); arms.scale.set(1.3,.5,.8); arms.userData = {z0:.22,rx0:0}; g.add(arms);
      addToFloor(g,x,z);
      return visualParts(g,{armReach:arms});
    },
    silbon(x, z) {
      const T = THREE, g = new T.Group(), [C, M] = getCaches();
      if (!M.silbon) M.silbon = spectralMaterial({color:0x0d0f14,emissive:0x161a22,emissiveIntensity:.5,transparent:true,opacity:.96,swayAmp:.06,swaySpeed:1.3,swayAnchorY:2.0,swayRange:2.3,rimColor:0x3c4a56,rimStrength:.5,rimPower:2.0,hem:{bottom:.05,top:1.25}});
      if (!C.silbon) C.silbon = keepGeometry(lathe([[.03,-.1],[.15,.4],[.21,1.2],[.16,2.2],[.11,2.9],[.08,3.15]],14));
      if (!C.silbonHead) C.silbonHead = keepGeometry(new T.SphereGeometry(.17,12,12));
      if (!C.faceP) C.faceP = keepGeometry(new T.PlaneGeometry(.3,.36));
      if (!M.silbonHat) M.silbonHat = spectralMaterial({color:0x8a7a55,emissive:0x2a2418,emissiveIntensity:.3,rimColor:0xaa9866,rimStrength:.25,rimPower:2.5});
      if (!C.silbonCrown) C.silbonCrown = keepGeometry(new T.CylinderGeometry(.15,.16,.22,12));
      if (!C.silbonBrim) C.silbonBrim = keepGeometry(new T.CylinderGeometry(.44,.44,.03,18));
      if (!M.sack) M.sack = spectralMaterial({color:0x6b5a3f,emissive:0x1a140c,emissiveIntensity:.35,rimColor:0x8a7550,rimStrength:.3,rimPower:2.4});
      if (!C.sack) C.sack = keepGeometry(new T.SphereGeometry(.3,12,12));
      g.add(new T.Mesh(C.silbon,M.silbon));
      const head = new T.Mesh(C.silbonHead,M.silbon); head.position.y = 3.15; g.add(head);
      const face = new T.Mesh(C.faceP,new T.MeshBasicMaterial({map:faceTexture('silbon'),transparent:true})); face.scale.set(.8,.8,.8); face.position.set(0,3.16,.15); g.add(face);
      const crown = new T.Mesh(C.silbonCrown,M.silbonHat); crown.position.y = 3.42; g.add(crown);
      const brim = new T.Mesh(C.silbonBrim,M.silbonHat); brim.position.y = 3.32; g.add(brim);
      const sack = new T.Mesh(C.sack,M.sack); sack.position.set(.34,2.35,-.12); sack.scale.set(1,1.4,1); g.add(sack);
      addToFloor(g,x,z);
      return visualParts(g);
    },
    duende(x, z) {
      const T = THREE, g = new T.Group(), [C, M] = getCaches();
      if (!M.duende) M.duende = spectralMaterial({color:0x4a3a28,emissive:0x281d12,emissiveIntensity:.55,swayAmp:.012,swaySpeed:6,swayAnchorY:.85,swayRange:.9,rimColor:0x8a6a2a,rimStrength:.3,rimPower:2.6});
      if (!C.duendeBody) C.duendeBody = keepGeometry(lathe([[.17,0],[.2,.16],[.17,.36],[.11,.55],[.14,.66]],12));
      if (!C.duendeHead) C.duendeHead = keepGeometry(new T.SphereGeometry(.15,10,10));
      if (!M.duendeHat) M.duendeHat = spectralMaterial({color:0xE63946,emissive:0x7a1118,emissiveIntensity:.6,rimColor:0xE63946,rimStrength:.4,rimPower:2.3});
      if (!C.duendeHat) C.duendeHat = keepGeometry(new T.ConeGeometry(.18,.36,10));
      if (!M.eyeGold) { M.eyeGold = material({color:0xffd166,emissive:0xffd166,emissiveIntensity:2}); M.eyeGold.userData.keep = true; }
      if (!C.eye) C.eye = keepGeometry(new T.SphereGeometry(.045,8,8));
      g.add(new T.Mesh(C.duendeBody,M.duende));
      const head = new T.Mesh(C.duendeHead,M.duende); head.position.set(0,.7,.02); g.add(head);
      const hat = new T.Mesh(C.duendeHat,M.duendeHat); hat.position.y = .94; hat.rotation.z = .14; g.add(hat);
      const eL = new T.Mesh(C.eye,M.eyeGold); eL.scale.setScalar(.72); eL.position.set(-.055,.72,.12);
      const eR = eL.clone(); eR.position.x = .055; g.add(eL); g.add(eR);
      addToFloor(g,x,z);
      return visualParts(g,{eyes:[eL,eR]});
    },
  };

  return function meshFactory(kind, x, z) {
    if (!BESTIARY_KINDS.has(kind)) throw new RangeError(`unknown bestiary kind: ${kind}`);
    return factories[kind](x,z);
  };
}

export function createBestiary({
  behaviors = {},
  context = null,
  meshFactory = () => ({}),
  createVector3 = DEFAULT_VECTOR,
  getSpawnPull = () => 1,
  random = Math.random,
} = {}) {
  const spawned = [];
  let activeFrame = null;

  function getContext() {
    return typeof context === 'function' ? context() : context;
  }

  function route(entity, now, dt) {
    const behavior = behaviors[entity.kind];
    if (typeof behavior === 'function') return behavior(entity, now, dt);
    return tickEntity(entity, now, dt, activeFrame);
  }

  function spawn(kind, x, z) {
    if (!BESTIARY_KINDS.has(kind)) {
      throw new RangeError(`unknown bestiary kind: ${kind}`);
    }
    const world = getContext();
    const pull = getSpawnPull(world);
    const visuals = meshFactory(kind, x, z, pull) || {};
    const settings = ENTITY_FACTORIES[kind](x, z, pull, random);
    const pos = createVector3(x, 0, z);
    const group = visuals.group ?? null;
    if (group?.position?.set) group.position.set(x, 0, z);
    if (kind === 'sayona' && group) group.visible = false;

    const entity = {
      kind,
      type: kind,
      group,
      eyes: visuals.eyes ?? null,
      faceCalm: visuals.faceCalm ?? null,
      faceTrue: visuals.faceTrue ?? null,
      armReach: visuals.armReach ?? null,
      jaw: visuals.jaw ?? null,
      pos,
      state: settings.state,
      phase: settings.phase,
      breathe: settings.breathe ?? null,
      lurch: settings.lurch ?? null,
      speed: {
        patrol: settings.speed.patrol,
        hunt: settings.speed.hunt,
        lunge: settings.speed.lunge,
      },
      senseRange: settings.senseRange,
      catchRadius: settings.catchRadius,
      grace: settings.grace,
      delay: settings.delay,
      calm: settings.calm ?? false,
      revealT: 0,
      announced: false,
      lastSeen: createVector3(x, 0, z),
      waypoint: null,
      searchT: 0,
      sobT: settings.sobT,
      wailed: false,
      whistleT: settings.whistleT,
      fleeT: settings.fleeT,
      gigT: undefined,
      sawHide: false,
      reachT: 0,
      catchMessage: settings.catchMessage,
      tick(now, dt) {
        return route(entity, now, dt);
      },
    };
    Object.defineProperties(entity, {
      x: {
        enumerable: true,
        get() { return entity.pos.x; },
        set(value) { entity.pos.x = value; },
      },
      z: {
        enumerable: true,
        get() { return entity.pos.z; },
        set(value) { entity.pos.z = value; },
      },
    });
    spawned.push(entity);
    return entity;
  }

  function tick(now, dt) {
    const world = getContext();
    if (world) world._nearest = 1e9;
    const frame = { world, stopped: false };
    const previousFrame = activeFrame;
    activeFrame = frame;
    try {
      for (const entity of spawned) {
        entity.tick(now, dt);
        if (frame.stopped) break;
      }
    } finally {
      activeFrame = previousFrame;
    }
  }

  function animate(now, dt) {
    for (const entity of spawned) animateEntity(entity, now, dt);
  }

  function remove(entity) {
    const index = spawned.indexOf(entity);
    if (index < 0) return false;
    spawned.splice(index, 1);
    return true;
  }

  function clear() {
    spawned.length = 0;
  }

  function tickEntity(entity, now, dt, frame) {
    const world = frame ? frame.world : getContext();
    const cam = world?.camera;
    if (!world || !cam || !entity.group?.position?.set) return false;
    const fdir = world._fwd || createVector3(0, 0, -1);
    if (typeof fdir.set === 'function') fdir.set(0, 0, -1);
    if (typeof fdir.applyEuler === 'function') fdir.applyEuler(cam.rotation);
    const torch = world.torchOn && world.torchBattery > 0;
    const dx = cam.position.x - entity.pos.x, dz = cam.position.z - entity.pos.z;
    const dist = Math.hypot(dx, dz);
    entity.grace = Math.max(0, entity.grace - dt);
    if (entity.delay !== undefined && entity.delay > 0) {
      entity.delay -= dt;
      return false;
    }
    if (!entity.group.visible) entity.group.visible = true;
    if (entity.kind === 'sayona' && !entity.announced) {
      entity.announced = true;
      world.play?.('scream');
      world._banner?.('LA SAYONA TE HA VISTO');
      world._dread = Math.min(100, world._dread + 8);
    }
    const nearest = Number.isFinite(world._nearest) ? world._nearest : 1e9;
    world._nearest = Math.min(nearest, dist);
    const toEx = (entity.pos.x - cam.position.x) / (dist || 1);
    const toEz = (entity.pos.z - cam.position.z) / (dist || 1);
    const lit = torch && dist < 15 && (fdir.x * toEx + fdir.z * toEz) > 0.86;
    const canSee = !world.hidden || entity.sawHide;
    let tx = entity.pos.x, tz = entity.pos.z, speed = 0;
    const randomWaypoint = () => createVector3(
      (random() - 0.5) * world.roomHalf * 1.4,
      0,
      (random() - 0.5) * world.roomHalf * 1.4,
    );
    const seekLost = (baseSpeed) => {
      entity.state = 'search'; tx = entity.lastSeen.x; tz = entity.lastSeen.z; speed = baseSpeed;
      if (Math.hypot(entity.pos.x - tx, entity.pos.z - tz) < 0.9) {
        if (!entity.waypoint || Math.hypot(entity.pos.x - entity.waypoint.x, entity.pos.z - entity.waypoint.z) < 0.7) {
          entity.waypoint = randomWaypoint();
        }
        tx = entity.waypoint.x; tz = entity.waypoint.z;
      }
    };

    if (entity.kind === 'sombra') {
      if (canSee) {
        entity.state = dist < 2.6 ? 'lunge' : 'hunt';
        tx = cam.position.x; tz = cam.position.z;
        speed = entity.state === 'lunge' ? entity.speed.lunge : entity.speed.hunt;
        entity.lastSeen.set(cam.position.x, 0, cam.position.z);
      } else seekLost(entity.speed.hunt * 0.75);
      if (lit) speed = 0;
    } else if (entity.kind === 'sayona') {
      if (entity.calm && dist < 7 && canSee) {
        entity.calm = false;
        world.play?.('scream');
        world._banner?.('LA SAYONA MUESTRA SU VERDADERO ROSTRO');
        world._dread = Math.min(100, world._dread + 10);
      }
      if (canSee) {
        entity.state = 'hunt'; tx = cam.position.x; tz = cam.position.z;
        speed = entity.calm ? entity.speed.hunt * 0.55 : entity.speed.hunt;
        entity.lastSeen.set(cam.position.x, 0, cam.position.z);
      } else seekLost(entity.speed.hunt * 0.6);
    } else if (entity.kind === 'llorona') {
      entity.sobT -= dt;
      if (entity.sobT <= 0) {
        entity.sobT = 5 + random() * 3;
        world.play?.('sob', { dist });
      }
      if (canSee && dist < entity.senseRange && entity.grace <= 0) {
        if (!entity.wailed) {
          entity.wailed = true;
          world.play?.('scream');
          world._banner?.('LA LLORONA TE HA VISTO');
        }
        entity.state = 'hunt'; tx = cam.position.x; tz = cam.position.z;
        speed = entity.speed.hunt;
        entity.lastSeen.set(cam.position.x, 0, cam.position.z);
      } else if (entity.state === 'hunt' && canSee && dist < entity.senseRange * 1.8) {
        tx = cam.position.x; tz = cam.position.z; speed = entity.speed.hunt;
      } else {
        entity.state = 'patrol'; entity.wailed = false;
        if (!entity.waypoint || Math.hypot(entity.pos.x - entity.waypoint.x, entity.pos.z - entity.waypoint.z) < 0.7) {
          entity.waypoint = randomWaypoint();
        }
        tx = entity.waypoint.x; tz = entity.waypoint.z; speed = entity.speed.patrol;
      }
    } else if (entity.kind === 'silbon') {
      if (canSee) {
        entity.state = 'hunt'; tx = cam.position.x; tz = cam.position.z;
        speed = entity.speed.hunt;
        entity.lastSeen.set(cam.position.x, 0, cam.position.z);
      } else seekLost(entity.speed.hunt * 0.7);
      entity.whistleT -= dt;
      if (entity.whistleT <= 0) {
        entity.whistleT = 4.6;
        if (dist < 5) world.play?.('bones');
        else world.play?.('whistle', { dist });
      }
    } else if (entity.state === 'flee') {
      entity.fleeT -= dt;
      tx = entity.pos.x - (cam.position.x - entity.pos.x);
      tz = entity.pos.z - (cam.position.z - entity.pos.z);
      speed = entity.speed.hunt;
      if (entity.fleeT <= 0) { entity.state = 'patrol'; entity.waypoint = null; }
    } else if (dist < entity.senseRange && entity.grace <= 0 && canSee) {
      entity.state = 'hunt'; tx = cam.position.x; tz = cam.position.z; speed = entity.speed.hunt;
      if (!entity.gigT || now > entity.gigT) {
        entity.gigT = now + 2600;
        world.play?.('giggle', { dist });
      }
    } else {
      if (!entity.waypoint || Math.hypot(entity.pos.x - entity.waypoint.x, entity.pos.z - entity.waypoint.z) < 0.7) {
        entity.waypoint = randomWaypoint();
      }
      tx = entity.waypoint.x; tz = entity.waypoint.z; speed = entity.speed.patrol;
    }

    const mx = tx - entity.pos.x, mz = tz - entity.pos.z, ml = Math.hypot(mx, mz) || 1;
    if (speed > 0) { entity.pos.x += mx / ml * speed * dt; entity.pos.z += mz / ml * speed * dt; }
    const limit = world.roomHalf - 0.5;
    entity.pos.x = Math.max(-limit, Math.min(limit, entity.pos.x));
    entity.pos.z = Math.max(-limit, Math.min(limit, entity.pos.z));
    const bob = entity.kind === 'duende'
      ? Math.abs(Math.sin(now * 0.012 + entity.pos.x)) * 0.12
      : Math.sin(now * 0.004 + entity.pos.x) * 0.05;
    entity.group.position.set(entity.pos.x, bob, entity.pos.z);
    if (speed > 0) entity.group.rotation.y = Math.atan2(mx, mz);
    const hunting = entity.state === 'hunt' || entity.state === 'lunge';
    const dreadRate = entity.kind === 'sayona' ? 5.5
      : entity.kind === 'llorona' ? 4.5
        : entity.kind === 'duende' ? 3
          : entity.kind === 'sombra' ? (entity.state === 'lunge' ? 5.5 : 1.4)
            : 4.2;
    if (hunting && !lit) world._dread = Math.min(100, world._dread + dt * dreadRate);
    if (entity.eyes) {
      entity.eyes[0].material.emissiveIntensity = lit
        ? 0.7
        : hunting ? 2.6 + Math.sin(now * 0.018) * 0.9 : 1.5;
    }
    if (dist < entity.catchRadius && entity.grace <= 0 && canSee) {
      if (entity.kind === 'duende' && !world.hidden) {
        world._dread = Math.min(100, world._dread + 14);
        world.play?.('giggle', { dist: 1 });
        entity.state = 'flee'; entity.fleeT = 2.6; entity.grace = 1.2;
        const kx = dx / (dist || 1), kz = dz / (dist || 1), limit = world.roomHalf - 0.6;
        cam.position.x = Math.max(-limit, Math.min(limit, cam.position.x + kx * 1.4));
        cam.position.z = Math.max(-limit, Math.min(limit, cam.position.z + kz * 1.4));
        world._banner?.('¡LOS DUENDES!');
      } else {
        world.entityCatch?.(entity);
        if (frame) frame.stopped = true;
        return true;
      }
    }
    return false;
  }

  function animateEntity(entity, now, dt) {
    if (entity.delay !== undefined && entity.delay > 0) return;
    const group = entity.group;
    if (!group || !group.visible) return;
    const time = now * 0.001;
    if (entity.breathe) {
      const breathe = Math.sin(time * entity.breathe.spd + (entity.phase || 0)) * entity.breathe.amp;
      group.scale.set(1 + breathe, 1 + breathe * 0.6, 1 + breathe);
    }
    if (entity.lurch) group.rotation.z = Math.sin(time * entity.lurch.spd + (entity.phase || 0)) * entity.lurch.amp;
    if (entity.armReach) {
      const target = entity.state === 'hunt' || entity.state === 'lunge' ? 1 : 0;
      entity.reachT = (entity.reachT || 0) + (target - (entity.reachT || 0)) * Math.min(1, dt * 2.2);
      entity.armReach.position.z = entity.armReach.userData.z0 + entity.reachT * 0.45;
      entity.armReach.rotation.x = entity.armReach.userData.rx0 - entity.reachT * 0.6;
    }
    if (entity.kind === 'sayona' && entity.faceCalm && entity.faceTrue) {
      const target = entity.calm ? 0 : 1;
      entity.revealT = (entity.revealT || 0) + (target - (entity.revealT || 0)) * Math.min(1, dt * 1.6);
      entity.faceCalm.material.opacity = 1 - entity.revealT;
      entity.faceTrue.material.opacity = entity.revealT;
      if (entity.jaw) entity.jaw.position.y = entity.jaw.userData.y0 - entity.revealT * 0.06;
    }
  }

  return { spawn, tick, animate, remove, clear };
}

export function createNullBestiary() {
  function spawn(kind, x, z) {
    const pos = DEFAULT_VECTOR(x, 0, z);
    const entity = { kind, type: kind, x, z, pos, group: null, state: {}, tick() {} };
    return entity;
  }

  function tick() {}
  function animate() {}
  function remove() { return false; }
  function clear() {}

  return { spawn, tick, animate, remove, clear };
}

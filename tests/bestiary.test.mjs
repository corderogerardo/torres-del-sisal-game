import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BESTIARY_KINDS,
  createBestiary,
  createBestiaryMeshFactory,
  createNullBestiary,
} from '../public/bestiary.mjs';

function vector3(x = 0, y = 0, z = 0) {
  return {
    x,
    y,
    z,
    set(nextX, nextY, nextZ) {
      this.x = nextX;
      this.y = nextY;
      this.z = nextZ;
      return this;
    },
    applyEuler() {
      return this;
    },
  };
}

function group() {
  return {
    visible: true,
    position: vector3(),
    rotation: { x: 0, y: 0, z: 0 },
    scale: { set() {} },
    children: [],
    add(child) {
      this.children.push(child);
    },
  };
}

function visualsFor(kind) {
  return {
    group: group(),
    eyes: null,
    armReach: null,
    faceCalm: kind === 'sayona' ? { material: { opacity: 1 } } : null,
    faceTrue: kind === 'sayona' ? { material: { opacity: 0 } } : null,
  };
}

function gameContext() {
  const calls = [];
  const fwd = vector3(0, 0, -1);
  return {
    camera: { position: vector3(4, 1.7, 0), rotation: {} },
    roomHalf: 19,
    hidden: null,
    torchOn: false,
    torchBattery: 100,
    _fwd: fwd,
    _dread: 0,
    _nearest: Infinity,
    calls,
    play(...args) { calls.push(['play', ...args]); },
    _banner(...args) { calls.push(['banner', ...args]); },
    entityCatch(entity) { calls.push(['catch', entity]); },
  };
}

function createMeshFactoryHarness() {
  class FakeVector3 {
    constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  }
  class FakeObject {
    constructor() {
      this.position = new FakeVector3();
      this.rotation = new FakeVector3();
      this.scale = {
        x: 1,
        y: 1,
        z: 1,
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
        setScalar(value) { return this.set(value, value, value); },
      };
      this.children = [];
      this.userData = {};
      this.visible = true;
    }
    add(child) { this.children.push(child); }
  }
  class FakeGroup extends FakeObject {}
  class FakeGeometry { constructor(...args) { this.args = args; this.userData = {}; } }
  class FakeMaterial { constructor(options) { Object.assign(this, options); this.userData = {}; } }
  class FakeMesh extends FakeObject {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
      this.isMesh = true;
    }
    clone() {
      const clone = new FakeMesh(this.geometry, this.material);
      clone.position.set(this.position.x, this.position.y, this.position.z);
      clone.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z);
      clone.scale.set(this.scale.x, this.scale.y, this.scale.z);
      clone.userData = { ...this.userData };
      return clone;
    }
  }

  const floor = new FakeGroup();
  const caches = [{}, {}];
  const meshFactory = createBestiaryMeshFactory({
    THREE: {
      Group: FakeGroup,
      Mesh: FakeMesh,
      SphereGeometry: FakeGeometry,
      PlaneGeometry: FakeGeometry,
      CylinderGeometry: FakeGeometry,
      TorusGeometry: FakeGeometry,
      ConeGeometry: FakeGeometry,
      BoxGeometry: FakeGeometry,
      MeshBasicMaterial: FakeMaterial,
      DoubleSide: 2,
    },
    getFloorGroup: () => floor,
    getCaches: () => caches,
    keepGeometry(geometry) { geometry.userData.keep = true; return geometry; },
    spectralMaterial: (options) => new FakeMaterial(options),
    material: (options) => new FakeMaterial(options),
    lathe: (points, segments) => new FakeGeometry(points, segments),
    faceTexture: (kind) => ({ kind, userData: { keep: true } }),
  });
  return { floor, caches, meshFactory };
}

test('bestiary kinds expose the six-kind seam vocabulary frozen', () => {
  for (const kind of ['sombra', 'sayona', 'llorona', 'silbon', 'duende', 'manguanguas']) {
    assert.ok(BESTIARY_KINDS.has(kind), `missing kind ${kind}`);
  }
  assert.equal(BESTIARY_KINDS.size, 6);
  assert.ok(Object.isFrozen(BESTIARY_KINDS));
});

test('spawn rejects an unknown kind', () => {
  const bestiary = createBestiary({ behaviors: {} });
  assert.throws(() => bestiary.spawn('nope', 1, 2));
});

test('spawn returns one uniform shape for every kind', () => {
  const meshCalls = [];
  const bestiary = createBestiary({
    getSpawnPull: () => 2,
    random: () => 0.5,
    createVector3: vector3,
    meshFactory(kind, x, z) {
      const visuals = visualsFor(kind);
      meshCalls.push({ kind, x, z, visuals });
      return visuals;
    },
  });
  const shapes = [];
  const expected = {
    sombra: ['hunt', 2.7, 4.5, 1.15],
    sayona: ['idle', 5.1, undefined, 1.2],
    llorona: ['patrol', 5.4, undefined, 1.1],
    silbon: ['hunt', 3, undefined, 1.1],
    duende: ['patrol', 6.2, undefined, 0.85],
    manguanguas: ['patrol', 4.4, undefined, 1.05],
  };
  for (const kind of BESTIARY_KINDS) {
    const entity = bestiary.spawn(kind, 3, 4);
    assert.equal(entity.kind, kind);
    assert.equal(entity.type, kind);
    assert.equal(entity.x, 3);
    assert.equal(entity.z, 4);
    assert.deepEqual([entity.pos.x, entity.pos.y, entity.pos.z], [3, 0, 4]);
    assert.equal(entity.group, meshCalls.at(-1).visuals.group);
    assert.equal(entity.state, expected[kind][0]);
    assert.equal(entity.speed.hunt, expected[kind][1]);
    assert.equal(entity.speed.lunge, expected[kind][2]);
    assert.equal(entity.catchRadius, expected[kind][3]);
    if (kind === 'manguanguas') {
      assert.equal(entity.speed.patrol, 0.9);
      assert.equal(entity.senseRange, 7.5);
      assert.equal(entity.grace, 3);
      assert.equal(entity.catchMessage, 'EL MANGUANGUAS TE RETUVO EN LA CONVERSA');
    }
    assert.ok(entity.lastSeen && typeof entity.lastSeen.set === 'function');
    assert.equal(typeof entity.tick, 'function');
    shapes.push(Object.keys(entity).sort());
  }
  assert.equal(new Set(shapes.map((shape) => JSON.stringify(shape))).size, 1);
  assert.deepEqual(meshCalls.map(({ kind, x, z }) => [kind, x, z]),
    [...BESTIARY_KINDS].map((kind) => [kind, 3, 4]));
});

test('Manguanguas uses the shared pursuit and catch flow', () => {
  const world = gameContext();
  world.camera.position.set(5, 1.7, 0);
  const bestiary = createBestiary({
    context: world,
    createVector3: vector3,
    random: () => 0.5,
    meshFactory: () => visualsFor('manguanguas'),
  });
  const manguanguas = bestiary.spawn('manguanguas', 0, 0);
  manguanguas.grace = 0;

  bestiary.tick(1000, 0.1);

  assert.equal(manguanguas.state, 'hunt');
  assert.ok(manguanguas.x > 0);
  assert.equal(manguanguas.catchMessage, 'EL MANGUANGUAS TE RETUVO EN LA CONVERSA');

  world.camera.position.set(manguanguas.x + 0.5, 1.7, manguanguas.z);
  bestiary.tick(1100, 0.1);

  assert.deepEqual(world.calls.filter(([kind]) => kind === 'catch'), [['catch', manguanguas]]);
});

test('tick routes to the injected per-kind behavior with (now, dt)', () => {
  const calls = [];
  const bestiary = createBestiary({
    behaviors: {
      sombra(entity, now, dt) { calls.push(['sombra', entity, now, dt]); },
      sayona(entity, now, dt) { calls.push(['sayona', entity, now, dt]); },
      llorona(entity, now, dt) { calls.push(['llorona', entity, now, dt]); },
      silbon(entity, now, dt) { calls.push(['silbon', entity, now, dt]); },
      duende(entity, now, dt) { calls.push(['duende', entity, now, dt]); },
    },
  });
  const sombra = bestiary.spawn('sombra', 1, 2);
  bestiary.spawn('sayona', 5, 6);
  bestiary.tick(1000, 16);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'sombra');
  assert.equal(calls[0][1], sombra);
  assert.equal(calls[0][2], 1000);
  assert.equal(calls[0][3], 16);
  assert.equal(calls[1][0], 'sayona');
  assert.equal(calls[1][2], 1000);
  assert.equal(calls[1][3], 16);
  calls.length = 0;
  sombra.tick(2000, 32);
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0][0], calls[0][2], calls[0][3]], ['sombra', 2000, 32]);
});

test('entity tick preserves Game movement and AI timing through the shared context', () => {
  const world = gameContext();
  const bestiary = createBestiary({
    context: world,
    createVector3: vector3,
    getSpawnPull: () => 1,
    meshFactory: () => visualsFor('sombra'),
  });
  const sombra = bestiary.spawn('sombra', 0, 0);

  sombra.tick(1000, 0.5);

  assert.equal(sombra.grace, 2.5);
  assert.equal(sombra.state, 'hunt');
  assert.ok(Math.abs(sombra.pos.x - 0.675) < 1e-12);
  assert.equal(sombra.pos.z, 0);
  assert.equal(sombra.group.position.x, sombra.pos.x);
  assert.equal(sombra.lastSeen.x, 4);
  assert.equal(world._nearest, 4);
  assert.ok(Math.abs(world._dread - 0.7) < 1e-12);
});

test('respawn delay keeps a Sayona hidden until its next eligible tick', () => {
  const world = gameContext();
  world.camera.position.set(10, 1.7, 0);
  const bestiary = createBestiary({
    context: world,
    createVector3: vector3,
    getSpawnPull: () => 1,
    random: () => 0.5,
    meshFactory: () => visualsFor('sayona'),
  });
  const sayona = bestiary.spawn('sayona', 0, 0);
  sayona.delay = 1.5;

  sayona.tick(1000, 0.75);
  assert.equal(sayona.delay, 0.75);
  assert.equal(sayona.group.visible, false);
  sayona.tick(1750, 0.75);
  assert.equal(sayona.delay, 0);
  assert.equal(sayona.group.visible, false);
  sayona.tick(2500, 0.1);

  assert.equal(sayona.group.visible, true);
  assert.equal(sayona.announced, true);
  assert.deepEqual(world.calls.slice(0, 2), [
    ['play', 'scream'],
    ['banner', 'LA SAYONA TE HA VISTO'],
  ]);
});

test('animate preserves the Sayona reveal transition', () => {
  const bestiary = createBestiary({
    createVector3: vector3,
    getSpawnPull: () => 1,
    meshFactory: () => visualsFor('sayona'),
  });
  const sayona = bestiary.spawn('sayona', 1, 2);
  sayona.delay = 0;
  sayona.group.visible = true;
  sayona.calm = false;

  bestiary.animate(1000, 0.5);

  assert.equal(sayona.revealT, 0.8);
  assert.ok(Math.abs(sayona.faceCalm.material.opacity - 0.2) < 1e-12);
  assert.ok(Math.abs(sayona.faceTrue.material.opacity - 0.8) < 1e-12);
});

test('remove excludes an entity from subsequent bestiary ticks', () => {
  const calls = [];
  const bestiary = createBestiary({
    behaviors: {
      sombra(entity, now, dt) { calls.push([entity, now, dt]); },
    },
  });
  const entity = bestiary.spawn('sombra', 1, 2);

  bestiary.tick(1000, 16);
  assert.equal(bestiary.remove(entity), true);
  assert.equal(bestiary.remove(entity), false);
  bestiary.tick(2000, 32);

  assert.deepEqual(calls, [[entity, 1000, 16]]);
});

test('mesh factory builds all six render groups from injected Three dependencies', () => {
  const { floor, meshFactory } = createMeshFactoryHarness();

  let manguanguasGroup;
  const anatomyMarkers = [];
  const silhouetteGeometries = [];
  const expectedAnatomy = {
    sombra: 'sombra-abstract-wraith',
    sayona: 'sayona-white-saya',
    llorona: 'llorona-skeletal-veil',
    silbon: 'silbon-extreme-height',
    duende: 'duende-small-red-hat',
    manguanguas: 'manguanguas-coffee-visitor',
  };
  for (const [index, kind] of [...BESTIARY_KINDS].entries()) {
    const visuals = meshFactory(kind, index + 1, index + 2);
    assert.equal(visuals.group.position.x, index + 1);
    assert.equal(visuals.group.position.z, index + 2);
    assert.ok(visuals.group.children.length > 0);

    const meshes = [];
    const visit = (node) => {
      if (node.isMesh) meshes.push(node);
      for (const child of node.children) visit(child);
    };
    visit(visuals.group);
    const shadowCasters = meshes.filter((mesh) => mesh.userData.shadowCaster === true);
    assert.equal(shadowCasters.length, 1, `${kind} must expose exactly one shadow silhouette`);
    assert.equal(shadowCasters[0].userData.anatomy, expectedAnatomy[kind]);
    anatomyMarkers.push(shadowCasters[0].userData.anatomy);
    silhouetteGeometries.push(shadowCasters[0].geometry);

    assert.equal(visuals.eyes?.length, 2, `${kind} should expose its visible eye pair`);
    assert.equal(visuals.eyelids?.length, visuals.eyes.length, `${kind} needs one lid per eye`);
    for (const lid of visuals.eyelids) {
      assert.equal(lid.userData.eyeLid, true);
      assert.ok(lid.scale.x > 0 && lid.scale.y > 0 && lid.scale.z > 0);
    }
    if (kind === 'manguanguas') manguanguasGroup = visuals.group;
  }
  assert.equal(new Set(anatomyMarkers).size, BESTIARY_KINDS.size);
  assert.equal(new Set(silhouetteGeometries).size, BESTIARY_KINDS.size);
  const coffeeCup = manguanguasGroup.children.find((child) => child.name === 'coffee-cup');
  assert.equal(coffeeCup?.children.length, 3, 'Manguanguas must carry a cup, coffee, and handle');
  assert.equal(floor.children.length, BESTIARY_KINDS.size);
});

test('arm segments stay welded to their shoulder and elbow joints', () => {
  const { meshFactory } = createMeshFactoryHarness();
  const jointTolerance = 0.005;
  for (const kind of ['sayona', 'llorona', 'silbon', 'manguanguas']) {
    const visuals = meshFactory(kind, 0, 0);
    const meshes = [];
    const visit = (node) => {
      if (node.isMesh) meshes.push(node);
      for (const child of node.children) visit(child);
    };
    visit(visuals.group);
    const parts = (name) => meshes.filter((mesh) => mesh.userData.part === name);
    const shoulders = parts('shoulder');
    const elbows = parts('elbow');
    const uppers = parts('upper');
    const forearms = parts('fore');
    const hands = parts('hand');
    assert.equal(uppers.length, 2, `${kind} needs a pair of upper arms`);
    assert.equal(forearms.length, 2, `${kind} needs a pair of forearms`);
    assert.equal(shoulders.length, 2, `${kind} needs a pair of shoulders`);
    assert.equal(elbows.length, 2, `${kind} needs a pair of elbows`);
    assert.equal(hands.length, 2, `${kind} needs a pair of hands`);

    const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < jointTolerance;
    const endpoint = (mesh, direction) => {
      const length = mesh.geometry.args[2];
      const angle = mesh.rotation.z;
      return {
        x: mesh.position.x - Math.sin(angle) * direction * length / 2,
        y: mesh.position.y + Math.cos(angle) * direction * length / 2,
      };
    };
    for (const upper of uppers) {
      assert.ok(shoulders.some((shoulder) => near(shoulder.position, endpoint(upper, 1))),
        `${kind}: an upper arm starts away from its shoulder`);
      const bottom = endpoint(upper, -1);
      assert.ok(elbows.some((elbow) => near(elbow.position, bottom)),
        `${kind}: an upper arm ends away from its elbow`);
    }
    for (const fore of forearms) {
      assert.ok(elbows.some((elbow) => near(elbow.position, endpoint(fore, 1))),
        `${kind}: a forearm starts away from its elbow`);
      const wrist = endpoint(fore, -1);
      assert.ok(hands.some((hand) => near(hand.position, wrist)),
        `${kind}: a forearm ends away from its hand`);
    }
  }
});

test('Silbón carries the bone sack from his hand instead of levitating it', () => {
  const { meshFactory } = createMeshFactoryHarness();
  const visuals = meshFactory('silbon', 0, 0);
  const meshes = [];
  const visit = (node) => {
    if (node.isMesh) meshes.push(node);
    for (const child of node.children) visit(child);
  };
  visit(visuals.group);
  const sack = meshes.find((mesh) => mesh.userData.part === 'sack');
  const hands = meshes.filter((mesh) => mesh.userData.part === 'hand');
  assert.ok(sack, 'silbon must carry a sack');
  assert.equal(hands.length, 2, 'silbon needs a pair of hands');

  const sackTop = sack.position.y + sack.geometry.args[0] * sack.scale.y;
  const nearest = hands.reduce((best, hand) => {
    const handBottom = hand.position.y - (hand.geometry.args[1] * hand.scale.y) / 2;
    const distance = Math.hypot(hand.position.x - sack.position.x, handBottom - sackTop);
    return distance < best ? distance : best;
  }, Infinity);

  assert.ok(nearest < 0.12, `the sack floats ${nearest.toFixed(2)} away from the nearest hand`);
});

test('eyelids blink deterministically on staggered schedules without per-frame meshes or arrays', () => {
  const { meshFactory } = createMeshFactoryHarness();
  const bestiary = createBestiary({ createVector3: vector3, meshFactory });
  const first = bestiary.spawn('sombra', 0, 0);
  const second = bestiary.spawn('sombra', 1, 0);
  assert.ok(first.eyelids?.length, 'Sombra should expose eyelids to its animation path');
  assert.ok(second.eyelids?.length, 'Sombra should expose eyelids to its animation path');

  const firstLids = first.eyelids;
  const firstChildCount = first.group.children.length;
  bestiary.animate(40, 0.04);
  assert.ok(firstLids.every((lid) => lid.scale.y > lid.userData.openScaleY), 'first spawn should close its lids');
  assert.ok(second.eyelids.every((lid) => lid.scale.y === lid.userData.openScaleY), 'second spawn should remain open');

  bestiary.animate(200, 0.16);
  assert.ok(firstLids.every((lid) => lid.scale.y === lid.userData.openScaleY), 'first spawn should reopen');
  bestiary.animate(1250, 1.05);
  assert.ok(firstLids.every((lid) => lid.scale.y === lid.userData.openScaleY), 'first schedule should still be open');
  assert.ok(second.eyelids.every((lid) => lid.scale.y > lid.userData.openScaleY), 'second spawn should blink later');

  const replay = createBestiary({ createVector3: vector3, meshFactory });
  const replayFirst = replay.spawn('sombra', 0, 0);
  const replaySecond = replay.spawn('sombra', 1, 0);
  replay.animate(1250, 1.05);
  assert.equal(replayFirst.eyelids[0].scale.y, firstLids[0].scale.y);
  assert.equal(replaySecond.eyelids[0].scale.y, second.eyelids[0].scale.y);

  bestiary.animate(1400, 0.15);
  assert.ok(second.eyelids.every((lid) => lid.scale.y === lid.userData.openScaleY), 'second spawn should reopen');
  assert.strictEqual(first.eyelids, firstLids);
  assert.equal(first.group.children.length, firstChildCount);
});

test('Sayona reveal keeps red irises and fangs visible while eyelids stay out of the transition', () => {
  const { meshFactory } = createMeshFactoryHarness();
  const bestiary = createBestiary({ createVector3: vector3, meshFactory, random: () => 0.5 });
  const sayona = bestiary.spawn('sayona', 0, 0);
  assert.equal(sayona.eyelids?.length, 2);
  assert.equal(sayona.fangs?.length, 2);
  assert.ok(Number.isFinite(sayona.blinkPeriod));
  sayona.delay = 0;
  sayona.group.visible = true;
  sayona.calm = false;

  const duringBlink = (sayona.blinkPeriod - sayona.blinkOffset + 0.04) * 1000;
  bestiary.animate(duringBlink, 0.5);

  assert.equal(sayona.revealT, 0.8);
  assert.ok(sayona.faceTrue.material.opacity > 0.5);
  assert.ok(sayona.faceCalm.material.opacity < 0.5);
  assert.ok(sayona.irises.every((iris) => iris.material === iris.userData.trueMat));
  assert.ok(sayona.fangs.every((fang) => fang.visible));
  assert.ok(sayona.eyelids.every((lid) => lid.scale.y === lid.userData.openScaleY));
});

test('Llorona preserves her sob cycle and announces pursuit within sensing range', () => {
  const world = gameContext();
  const bestiary = createBestiary({
    context: world,
    createVector3: vector3,
    random: () => 0.5,
    meshFactory: () => visualsFor('llorona'),
  });
  const llorona = bestiary.spawn('llorona', 0, 0);
  llorona.grace = 0;
  llorona.sobT = 0.1;

  bestiary.tick(1000, 0.2);

  assert.equal(llorona.state, 'hunt');
  assert.equal(llorona.wailed, true);
  assert.equal(llorona.sobT, 6.5);
  assert.deepEqual(world.calls, [
    ['play', 'sob', { dist: 4 }],
    ['play', 'scream'],
    ['banner', 'LA LLORONA TE HA VISTO'],
  ]);
});

test('Silbon keeps the nearby-bones and distant-whistle sound branches', () => {
  const world = gameContext();
  world.camera.position.set(8, 1.7, 0);
  const bestiary = createBestiary({
    context: world,
    createVector3: vector3,
    meshFactory: () => visualsFor('silbon'),
  });
  const silbon = bestiary.spawn('silbon', 0, 0);
  silbon.whistleT = 0.1;

  bestiary.tick(1000, 0.2);
  assert.deepEqual(world.calls, [['play', 'whistle', { dist: 8 }]]);

  world.calls.length = 0;
  world.camera.position.set(4, 1.7, 0);
  silbon.whistleT = 0.1;
  bestiary.tick(1200, 0.2);

  assert.deepEqual(world.calls, [['play', 'bones']]);
  assert.equal(silbon.whistleT, 4.6);
});

test('Duende preserves flee, player push-out, dread, and warning effects', () => {
  const world = gameContext();
  world.camera.position.set(0.5, 1.7, 0);
  const bestiary = createBestiary({
    context: world,
    createVector3: vector3,
    meshFactory: () => visualsFor('duende'),
  });
  const duende = bestiary.spawn('duende', 0, 0);
  duende.grace = 0;

  bestiary.tick(1000, 0.1);

  assert.equal(duende.state, 'flee');
  assert.equal(duende.fleeT, 2.6);
  assert.equal(duende.grace, 1.2);
  assert.equal(world.camera.position.x, 1.9);
  assert.ok(Math.abs(world._dread - 14.3) < 1e-12);
  assert.deepEqual(world.calls, [
    ['play', 'giggle', { dist: 0.5 }],
    ['play', 'giggle', { dist: 1 }],
    ['banner', '¡LOS DUENDES!'],
  ]);
});

test('invalid spawn kinds fail before registration and zero coordinates work', () => {
  const calls = [];
  const bestiary = createBestiary({ behaviors: { sombra(entity) { calls.push(entity); } } });
  const center = bestiary.spawn('sombra', 0, 0);
  assert.deepEqual([center.pos.x, center.pos.z], [0, 0]);
  assert.throws(() => bestiary.spawn('', 0, 0), {
    name: 'RangeError', message: 'unknown bestiary kind: ',
  });
  assert.throws(() => bestiary.spawn(null, 0, 0), {
    name: 'RangeError', message: 'unknown bestiary kind: null',
  });
  bestiary.tick(1, 0);
  assert.deepEqual(calls, [center]);
});

test('Sombra stops under torch and resumes at lunge speed in darkness', () => {
  const world = gameContext();
  world.camera.position.set(0, 1.7, 2);
  world.torchOn = true;
  const bestiary = createBestiary({
    context: world, createVector3: vector3, meshFactory: () => visualsFor('sombra'),
  });
  const sombra = bestiary.spawn('sombra', 0, 0);
  sombra.grace = 0;

  bestiary.tick(1000, 0.1);
  assert.equal(sombra.state, 'lunge');
  assert.deepEqual([sombra.pos.x, sombra.pos.z], [0, 0]);
  assert.equal(world._dread, 0);

  world.torchOn = false;
  bestiary.tick(1100, 0.1);
  assert.ok(Math.abs(sombra.pos.z - 0.225) < 1e-12);
  assert.ok(Math.abs(world._dread - 0.55) < 1e-12);
});

test('Sayona reveals on approach and announces only once', () => {
  const world = gameContext();
  const bestiary = createBestiary({
    context: world, createVector3: vector3, random: () => 0.5,
    meshFactory: () => visualsFor('sayona'),
  });
  const sayona = bestiary.spawn('sayona', 0, 0);
  sayona.delay = 0;

  bestiary.tick(1000, 0.1);
  assert.equal(sayona.group.visible, true);
  assert.equal(sayona.calm, false);
  assert.deepEqual(world.calls, [
    ['play', 'scream'], ['banner', 'LA SAYONA TE HA VISTO'],
    ['play', 'scream'], ['banner', 'LA SAYONA MUESTRA SU VERDADERO ROSTRO'],
  ]);

  bestiary.animate(1100, 0.5);
  assert.ok(Math.abs(sayona.faceTrue.material.opacity - 0.8) < 1e-12);
  bestiary.tick(1200, 0.1);
  assert.equal(world.calls.length, 4);
});

test('null bestiary stays silent and never throws', () => {
  const silent = createNullBestiary();
  for (const kind of ['sombra', 'sayona', 'llorona', 'silbon', 'duende', 'nope']) {
    const entity = silent.spawn(kind, 1, 2);
    assert.equal(typeof entity.tick, 'function');
    entity.tick(1000, 16);
  }
  silent.tick(1000, 16);
  silent.tick();
});

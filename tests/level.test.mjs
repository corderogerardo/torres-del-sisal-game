import assert from 'node:assert/strict';
import test from 'node:test';
import { LEVEL_LAYOUTS, createLevel, disposeGroup, findFreeSpot, spotBlocked } from '../public/level.mjs';

const ROOM = {
  kind: 'room',
  colliders: [{ x0: -10, x1: 10, z0: -10.2, z1: -9.8 }],
  pickups: [{ id: 'ward', x: 2, z: 3, radius: 1.7 }],
};

test('collides reports true/false against known layout literals', () => {
  const placed = [];
  const level = createLevel({
    createBox: (box) => { placed.push(box); return box; },
    layout: ROOM,
  });
  assert.ok(level);
  assert.equal(level.collides({ x: 0, z: -10 }, 0.5), true);
  assert.equal(level.collides({ x: 0, z: 0 }, 0.5), false);
  assert.deepEqual(placed, ROOM.colliders);
});

test('pickupAt returns the item once, then null once consumed', () => {
  const level = createLevel({ layout: ROOM });
  assert.deepEqual(level.pickupAt({ x: 2, z: 3 }), { id: 'ward', x: 2, z: 3 });
  assert.equal(level.pickupAt({ x: 2, z: 3 }), null);
  assert.equal(level.pickupAt({ x: -5, z: -5 }), null);
});

test('resolve pushes a point out of a collider and preserves the mutation', () => {
  const level = createLevel({ layout: ROOM });
  const p = { x: 0, z: -9.5 };
  assert.equal(level.resolve(p, 0.5), true);
  assert.equal(p.z, -9.3);

  const free = { x: 0, z: 0 };
  assert.equal(level.resolve(free, 0.5), false);
  assert.deepEqual(free, { x: 0, z: 0 });
});

test('spotBlocked honors span math at the boundary', () => {
  const blocked = { limit: 9, boxes: [{ x0: 1, x1: 3, z0: 1, z1: 3 }], pad: 0.5 };
  assert.equal(spotBlocked(2, 2, blocked), true);
  assert.equal(spotBlocked(0.51, 2, blocked), true);
  assert.equal(spotBlocked(0.5, 2, blocked), false);
  assert.equal(spotBlocked(9, 0, blocked), false);
  assert.equal(spotBlocked(9.1, 0, blocked), true);
});

test('unknown layout is rejected without throwing', () => {
  assert.equal(createLevel({ layout: { kind: 'dungeon' } }), null);
  assert.equal(createLevel({ layout: null }), null);
  assert.equal(createLevel(), null);
});

test('level layouts expose the known seam vocabulary', () => {
  assert.ok(LEVEL_LAYOUTS.has('room'));
  assert.ok(Object.isFrozen(LEVEL_LAYOUTS));
});

// A free-spot draw is two rng calls: x = (r - .5) * 38 * .78, then z the same way.
const SPOT_SPAN = 38 * 0.78;

function drawsFor(x, z) {
  return [0.5 + x / SPOT_SPAN, 0.5 + z / SPOT_SPAN];
}

function spotOf(draws) {
  return [(draws[0] - 0.5) * 38 * 0.78, (draws[1] - 0.5) * 38 * 0.78];
}

function rngFrom(values) {
  let index = 0;
  return () => {
    if (index >= values.length) throw new Error(`rng exhausted after ${values.length} draws`);
    const value = values[index];
    index += 1;
    return value;
  };
}

test('findFreeSpot returns the first unblocked draw inside the search area', () => {
  const draws = drawsFor(7, 7);
  assert.deepEqual(findFreeSpot({ rng: rngFrom(draws) }), spotOf(draws));
});

test('findFreeSpot skips draws that land inside the spawn radius', () => {
  const nearSpawn = drawsFor(0, -14.8);
  const free = drawsFor(0, 0);
  assert.deepEqual(
    findFreeSpot({ rng: rngFrom([...nearSpawn, ...free]) }),
    spotOf(free),
  );
});

test('findFreeSpot skips draws inside a collider pad band', () => {
  const blocked = drawsFor(2.5, 0);
  const free = drawsFor(-6, 3);
  const colliders = [{ x0: -2, x1: 2, z0: -5, z1: 5 }];
  assert.deepEqual(
    findFreeSpot({ rng: rngFrom([...blocked, ...free]), colliders }),
    spotOf(free),
  );
});

test('findFreeSpot derives its limit from roomHalf', () => {
  const outside = drawsFor(9, 0);
  const inside = drawsFor(0, 0);
  assert.deepEqual(
    findFreeSpot({ rng: rngFrom([...outside, ...inside]), roomHalf: 10 }),
    spotOf(inside),
  );
});

test('findFreeSpot honors placed objects and pairs without mutating them', () => {
  const placed = [{ x: 0, z: 0 }, [6, -6]];
  const nearObject = drawsFor(1, 0);
  const nearPair = drawsFor(6.5, -6.5);
  const free = drawsFor(-8, 8);
  assert.deepEqual(
    findFreeSpot({ rng: rngFrom([...nearObject, ...nearPair, ...free]), placed }),
    spotOf(free),
  );
  assert.deepEqual(placed, [{ x: 0, z: 0 }, [6, -6]]);
});

test('relaxed pass accepts a spot inside the strict spawn radius', () => {
  const draw = drawsFor(0, -12);
  assert.deepEqual(
    findFreeSpot({ rng: rngFrom([...draw, ...draw]), tries: 1 }),
    spotOf(draw),
  );
});

test('relaxed pass accepts a spot inside the strict pad band', () => {
  const draw = drawsFor(2.75, 0);
  const colliders = [{ x0: -1, x1: 2, z0: -1, z1: 1 }];
  assert.deepEqual(
    findFreeSpot({ rng: rngFrom([...draw, ...draw]), tries: 1, colliders }),
    spotOf(draw),
  );
});

test('findFreeSpot falls back to a small random offset when both passes fail', () => {
  const rejected = drawsFor(0, 0);
  const colliders = [{ x0: -100, x1: 100, z0: -100, z1: 100 }];
  const draw = findFreeSpot({
    rng: rngFrom([...rejected, ...rejected, 0.6, 0.7]),
    tries: 1,
    relaxedTries: 1,
    colliders,
  });
  assert.deepEqual(draw, [(0.6 - 0.5) * 8, (0.7 - 0.5) * 8]);
});

test('findFreeSpot rejects a missing rng with TypeError', () => {
  assert.throws(() => findFreeSpot(), TypeError);
  assert.throws(() => findFreeSpot({ rng: null }), TypeError);
  assert.throws(() => findFreeSpot({ rng: 42 }), TypeError);
});

function fakeGroup(...nodes) {
  return {
    traverse(visit) {
      visit(this);
      for (const node of nodes) visit(node);
    },
  };
}

test('disposeGroup frees instanced buffers, geometry and materials per node', () => {
  const freed = [];
  const instanced = {
    isInstancedMesh: true,
    dispose: () => freed.push('instanced'),
    geometry: { dispose: () => freed.push('geometry') },
    material: { dispose: () => freed.push('material') },
  };
  disposeGroup(fakeGroup(instanced));
  assert.deepEqual(freed, ['instanced', 'geometry', 'material']);
});

test('disposeGroup frees every material in an array', () => {
  const freed = [];
  const a = { dispose: () => freed.push('a') };
  const b = { dispose: () => freed.push('b') };
  disposeGroup(fakeGroup({ material: [a, b] }));
  assert.deepEqual(freed, ['a', 'b']);
});

test('disposeGroup leaves keep-tagged geometry and materials alive', () => {
  const freed = [];
  const cached = { userData: { keep: true }, dispose: () => freed.push('cached') };
  disposeGroup(fakeGroup(
    { geometry: cached, material: cached },
    { isInstancedMesh: true, dispose: () => freed.push('instanced'), geometry: cached, material: cached },
    {
      geometry: { dispose: () => freed.push('geometry') },
      material: { dispose: () => freed.push('material') },
    },
  ));
  assert.deepEqual(freed, ['instanced', 'geometry', 'material']);
});

test('disposeGroup honors an injected keep predicate', () => {
  const freed = [];
  const geometry = { dispose: () => freed.push('geometry') };
  disposeGroup(fakeGroup({ geometry, material: { dispose: () => freed.push('material') } }), {
    keep: (value) => value === geometry,
  });
  assert.deepEqual(freed, ['material']);
});

test('disposeGroup tolerates invalid groups, missing methods and empty materials', () => {
  assert.doesNotThrow(() => disposeGroup(null));
  assert.doesNotThrow(() => disposeGroup(undefined));
  assert.doesNotThrow(() => disposeGroup('not-a-group'));
  assert.doesNotThrow(() => disposeGroup({}));
  assert.doesNotThrow(() => disposeGroup(fakeGroup(
    null,
    { isInstancedMesh: true },
    { geometry: {} },
    { material: {} },
    { material: [null, {}] },
  )));
});

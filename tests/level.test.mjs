import assert from 'node:assert/strict';
import test from 'node:test';
import { LEVEL_LAYOUTS, createLevel, spotBlocked } from '../public/level.mjs';

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

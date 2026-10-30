import assert from 'node:assert/strict';
import test from 'node:test';

import { selectAimTarget } from '../public/combat.mjs';

const camera = { x: 0, z: 0 };
const forward = { x: 0, z: 1 };
const entity = (x, z, extra = {}) => ({ pos: { x, z }, ...extra });

test('selects the nearest entity inside the aim cone and distance', () => {
  const near = entity(0, 5);
  const far = entity(0, 10);
  assert.equal(selectAimTarget({ cameraPosition: camera, forward, entities: [far, near] }), near);
});

test('rejects entities outside the cone or beyond the distance limit', () => {
  assert.equal(selectAimTarget({ cameraPosition: camera, forward, entities: [entity(5, 5)] }), null);
  assert.equal(selectAimTarget({ cameraPosition: camera, forward, entities: [entity(0, 14)] }), null);
  assert.equal(selectAimTarget({
    cameraPosition: camera, forward, maxDistance: 14, entities: [entity(0, 14)],
  })?.pos.z, 14);
});

test('keeps the first entity on a tie and tolerates invalid entries', () => {
  const first = entity(0, 5);
  const second = entity(0, 5);
  assert.equal(selectAimTarget({
    cameraPosition: camera, forward, entities: [null, {}, first, second],
  }), first);
  assert.equal(selectAimTarget({ cameraPosition: null, forward, entities: [first] }), null);
  assert.equal(selectAimTarget({ cameraPosition: camera, forward, entities: [] }), null);
});

test('skipDelayed filters only when requested', () => {
  const delayed = entity(0, 3, { delay: 2 });
  const ready = entity(0, 5, { delay: 0 });
  assert.equal(selectAimTarget({
    cameraPosition: camera, forward, entities: [delayed, ready], skipDelayed: true,
  }), ready);
  assert.equal(selectAimTarget({
    cameraPosition: camera, forward, entities: [delayed, ready], skipDelayed: false,
  }), delayed);
});

test('does not mutate the camera, forward vector or entities', () => {
  const entities = [entity(0, 5), entity(1, 2)];
  const snapshot = JSON.parse(JSON.stringify({ camera, forward, entities }));
  selectAimTarget({ cameraPosition: camera, forward, entities });
  assert.deepEqual({ camera, forward, entities }, snapshot);
});

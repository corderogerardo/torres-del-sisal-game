import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyWardPickup,
  applyPistolPickup,
  applyMementoPickup,
} from '../public/objectives.mjs';

test('ward reduces dread by 60 and adds 120 seconds capped by the floor clock', () => {
  assert.deepEqual(applyWardPickup({ dread: 80, timeLeft: 100, timeMax: 300 }), {
    dread: 20,
    timeLeft: 220,
  });
  assert.deepEqual(applyWardPickup({ dread: 10, timeLeft: 280, timeMax: 300 }), {
    dread: 0,
    timeLeft: 300,
  });
});

test('pistol adds four charges capped at eight', () => {
  assert.deepEqual(applyPistolPickup({ ammo: 0 }), { ammo: 4 });
  assert.deepEqual(applyPistolPickup({ ammo: 6 }), { ammo: 8 });
  assert.deepEqual(applyPistolPickup({ ammo: 8 }), { ammo: 8 });
});

test('memento reduces dread by ten without going negative', () => {
  assert.deepEqual(applyMementoPickup({ dread: 40 }), { dread: 30 });
  assert.deepEqual(applyMementoPickup({ dread: 5 }), { dread: 0 });
});

test('non-finite inputs fall back to safe values and inputs are not mutated', () => {
  const ward = { dread: 80, timeLeft: 100, timeMax: 300 };
  const pistol = { ammo: 2 };
  const memento = { dread: 20 };
  applyWardPickup(ward);
  applyPistolPickup(pistol);
  applyMementoPickup(memento);
  assert.deepEqual(ward, { dread: 80, timeLeft: 100, timeMax: 300 });
  assert.deepEqual(pistol, { ammo: 2 });
  assert.deepEqual(memento, { dread: 20 });
  assert.deepEqual(applyWardPickup({ dread: NaN, timeLeft: Infinity, timeMax: NaN }), {
    dread: 0,
    timeLeft: 0,
  });
  assert.deepEqual(applyPistolPickup({ ammo: NaN }), { ammo: 4 });
  assert.deepEqual(applyMementoPickup({ dread: NaN }), { dread: 0 });
});

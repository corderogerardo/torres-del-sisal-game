import assert from 'node:assert/strict';
import test from 'node:test';
import { getDifficultyConfig } from '../public/game-rules.mjs';

test('difficulty rules preserve each game difficulty configuration', () => {
  assert.deepEqual(getDifficultyConfig('Piadoso'), {
    time: 300, pull: 0.75, near: 5.5, spike: 20, rescue: 40, creep: 0.32,
  });
  assert.deepEqual(getDifficultyConfig('Normal'), {
    time: 180, pull: 1, near: 8, spike: 30, rescue: 50, creep: 0.5,
  });
  assert.deepEqual(getDifficultyConfig('Pesadilla'), {
    time: 150, pull: 1.5, near: 11, spike: 42, rescue: 65, creep: 0.7,
  });
});

test('unknown difficulty uses the existing Normal fallback', () => {
  assert.deepEqual(getDifficultyConfig('unknown'), getDifficultyConfig('Normal'));
});

test('difficulty configs cannot be mutated by callers', () => {
  const config = getDifficultyConfig('Normal');
  assert.throws(() => { config.time = 1; }, TypeError);
  assert.equal(getDifficultyConfig('Normal').time, 180);
});

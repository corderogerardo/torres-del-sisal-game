import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUDIO_KINDS,
  giggleLevel,
  sobLevel,
  squeakLevel,
  whistleLevel,
  levelFor,
  createNullAudioEngine,
  createAudioEngine,
} from '../public/audio.mjs';

test('audio kinds expose the eighteen-call-shape seam vocabulary', () => {
  for (const kind of ['scream', 'giggle', 'whistle', 'bones', 'sob', 'hooves', 'scare', 'squeak', 'ring', 'splash', 'vanish', 'chime', 'ascend', 'despair', 'release']) {
    assert.ok(AUDIO_KINDS.has(kind), `missing kind ${kind}`);
  }
  assert.ok(Object.isFrozen(AUDIO_KINDS));
});

test('dist attenuation matches the shipped game behavior', () => {
  assert.equal(giggleLevel(1), 0.14);
  assert.equal(giggleLevel(10), 0.05);
  assert.equal(giggleLevel(0.5), 0.14);
  assert.equal(sobLevel(1), 0.12);
  assert.ok(Math.abs(sobLevel(10) - 0.06666666666666667) < 1e-12);
  assert.equal(squeakLevel(1), 0.08);
  assert.equal(squeakLevel(10), 0.02);
  assert.equal(whistleLevel(2), 0.02);
  assert.ok(Math.abs(whistleLevel(9) - 0.085) < 1e-12);
  assert.ok(Math.abs(whistleLevel(20) - 0.15) < 1e-12);
});

test('levelFor centralizes dist math behind the play seam', () => {
  assert.equal(levelFor('giggle', 10), 0.05);
  assert.equal(levelFor('chime', 99), null);
});

test('null adapter stays silent for every known kind', () => {
  const silent = createNullAudioEngine();
  for (const kind of AUDIO_KINDS) {
    assert.equal(silent.play(kind, { dist: 3 }), true);
  }
  assert.equal(silent.play('nope', { dist: 1 }), false);
  silent.startAmbience();
  silent.stop();
});

test('engine routes play(kind) to the injected sink with centralized level', () => {
  const calls = [];
  const engine = createAudioEngine({
    sink: {
      giggle({ dist, level }) { calls.push(['giggle', dist, level]); },
    },
  });
  assert.equal(engine.play('giggle', { dist: 10 }), true);
  assert.deepEqual(calls, [['giggle', 10, 0.05]]);
  assert.equal(engine.play('scream', { dist: 1 }), false);
  assert.equal(engine.play('nope', { dist: 1 }), false);
});

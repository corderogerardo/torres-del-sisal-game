import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BESTIARY_KINDS,
  createBestiary,
  createNullBestiary,
} from '../public/bestiary.mjs';

test('bestiary kinds expose the five-kind seam vocabulary frozen', () => {
  for (const kind of ['sombra', 'sayona', 'llorona', 'silbon', 'duende']) {
    assert.ok(BESTIARY_KINDS.has(kind), `missing kind ${kind}`);
  }
  assert.equal(BESTIARY_KINDS.size, 5);
  assert.ok(Object.isFrozen(BESTIARY_KINDS));
});

test('spawn rejects an unknown kind', () => {
  const bestiary = createBestiary({ behaviors: {} });
  assert.throws(() => bestiary.spawn('nope', 1, 2));
});

test('spawn returns one uniform shape for every kind', () => {
  const bestiary = createBestiary({ behaviors: {} });
  for (const kind of BESTIARY_KINDS) {
    const entity = bestiary.spawn(kind, 3, 4);
    assert.equal(entity.kind, kind);
    assert.equal(entity.x, 3);
    assert.equal(entity.z, 4);
    assert.ok(entity.state && typeof entity.state === 'object');
    assert.equal(typeof entity.tick, 'function');
  }
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

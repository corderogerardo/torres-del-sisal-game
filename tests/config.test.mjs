import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MEMENTOS,
  SPAWN_FACTORY,
  RESPAWN_FACTORY,
  FLOOR_PLANS,
  THEMES,
} from '../public/config.mjs';

test('mementos preserve the six names, memories and order', () => {
  assert.equal(MEMENTOS.length, 6);
  assert.deepEqual(MEMENTOS.map((m) => m.name), [
    'La foto de tu madre',
    'El dibujo de tu hija',
    'La carta de un amigo',
    'El anillo de bodas',
    'Un mensaje de voz',
    'El rosario de tu abuela',
  ]);
  assert.equal(MEMENTOS[0].mem, 'Su risa en la cocina. El olor a café con leche.');
  assert.ok(Object.isFrozen(MEMENTOS));
  assert.ok(MEMENTOS.every((m) => Object.isFrozen(m)));
  assert.throws(() => { MEMENTOS[0].name = 'changed'; }, TypeError);
});

test('spawn and respawn maps preserve every code', () => {
  assert.deepEqual(SPAWN_FACTORY, {
    s: 'sombra', d: 'duende', y: 'sayona', l: 'llorona', b: 'silbon', m: 'manguanguas',
  });
  assert.deepEqual(RESPAWN_FACTORY, {
    sayona: 'sayona', silbon: 'silbon', duende: 'duende', manguanguas: 'manguanguas',
  });
  assert.ok(Object.isFrozen(SPAWN_FACTORY));
  assert.ok(Object.isFrozen(RESPAWN_FACTORY));
  assert.throws(() => { SPAWN_FACTORY.s = 'changed'; }, TypeError);
});

test('floor plans preserve the per-floor spawn sequence', () => {
  assert.deepEqual(FLOOR_PLANS, {
    1: ['s'],
    2: ['s', 's'],
    3: ['s', 'd', 'd'],
    4: ['l', 'm', 'd'],
    5: ['y', 's', 'd'],
    6: ['b', 'd', 'd', 's'],
    7: ['y', 'l', 'b', 's'],
  });
  assert.ok(Object.isFrozen(FLOOR_PLANS));
  assert.ok(FLOOR_PLANS[4].every((code) => Object.isFrozen(FLOOR_PLANS[4])));
  assert.throws(() => { FLOOR_PLANS[1].push('x'); }, TypeError);
});

test('themes preserve the seven floor identities and numeric palette', () => {
  assert.equal(THEMES.length, 7);
  assert.deepEqual(THEMES.map((t) => t.name), [
    'EL VESTÍBULO', 'PISO INUNDADO', 'LA CAPILLA ROTA', 'LA GUARDERÍA',
    'SALA DE ESPEJOS', 'EL MATADERO', 'LA AZOTEA',
  ]);
  assert.deepEqual(THEMES[0], {
    name: 'EL VESTÍBULO', wall: 0x474d54, floor: 0x2d3238, fog: 0x05070a,
    fogD: 0.044, accent: 0x8fb3d9, props: 9, tall: 0.25,
  });
  assert.ok(THEMES.every((t) => Object.isFrozen(t)));
  assert.throws(() => { THEMES[0].fogD = 1; }, TypeError);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRunState, stepRunState } from '../public/run-state.mjs';

// Shape returned by getDifficultyConfig('Normal') in public/game-rules.mjs.
const NORMAL = Object.freeze({ time: 180, pull: 1, near: 8, creep: 0.5, rescue: 50 });

function create(overrides = {}) {
  return createRunState({ difficulty: NORMAL, floor: 1, timeLeft: 180, ...overrides });
}

function assertClose(actual, expected, label = 'value') {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

function assertNoEvents(events) {
  assert.deepEqual(events, {
    forcedAscend: null,
    jumpEnding: false,
    rescuedEnding: false,
    lifelineUsed: false,
    carreton: false,
  });
}

test('createRunState fills the documented defaults from the difficulty config', () => {
  const state = createRunState({ difficulty: NORMAL });

  assert.equal(state.floor, 1);
  assert.equal(state.timeLeft, 180);
  assert.equal(state.dread, 0);
  assert.equal(state.stamina, 100);
  assert.equal(state.battery, 100);
  assert.equal(state.torchOn, true);
  assert.equal(state.temptation, 0);
  assert.equal(state.lifelines, 0);
  assert.equal(state.mementos, 0);
  assert.equal(state.rescueT, -1);
  assert.equal(state.carreton, false);
  assert.equal(state.ended, false);
  assert.equal(state.ending, null);
  assert.deepEqual(state.difficulty, NORMAL);
});

test('createRunState requires the resolved difficulty config', () => {
  assert.throws(() => createRunState({ timeLeft: 10 }), /getDifficultyConfig/);
  assert.throws(() => createRunState({ difficulty: 'Normal', timeLeft: 10 }), /getDifficultyConfig/);
});

test('createRunState clamps initial values into their valid ranges', () => {
  const state = createRunState({
    difficulty: NORMAL,
    timeLeft: 180,
    dread: 250,
    stamina: -5,
    battery: 120,
    temptation: 150,
    lifelines: -2,
    mementos: -1,
  });

  assert.equal(state.dread, 100);
  assert.equal(state.stamina, 0);
  assert.equal(state.battery, 100);
  assert.equal(state.temptation, 100);
  assert.equal(state.lifelines, 0);
  assert.equal(state.mementos, 0);
});

test('hidden run regenerates battery and stamina, and dread follows the nearest threat', () => {
  const result = stepRunState(
    create({ stamina: 40, battery: 40, dread: 10, temptation: 30, timeLeft: 100 }),
    1,
    { hidden: true, nearest: 2 },
  );

  assertClose(result.state.battery, 47, 'battery');
  assertClose(result.state.stamina, 51, 'stamina');
  assertClose(result.state.dread, 12.4, 'dread');
  assert.equal(result.state.temptation, 30);
  assert.equal(result.state.timeLeft, 99);
  assertNoEvents(result.events);
});

test('hidden dread falls when the nearest threat is far away', () => {
  const result = stepRunState(create({ dread: 10 }), 1, { hidden: true, nearest: 9 });
  assertClose(result.state.dread, 8.4, 'dread');

  const boundary = stepRunState(create({ dread: 10 }), 1, { hidden: true, nearest: 3.5 });
  assertClose(boundary.state.dread, 8.4, 'exactly 3.5 is not near');
});

test('hidden run on the rooftop cools temptation and keeps the clock frozen', () => {
  const result = stepRunState(
    create({ floor: 7, timeLeft: 9999, temptation: 30, dread: 10 }),
    1,
    { hidden: true, nearest: 9 },
  );

  assert.equal(result.state.temptation, 21);
  assert.equal(result.state.timeLeft, 9999);
  assertClose(result.state.dread, 8.4, 'dread');
  assertNoEvents(result.events);
});

test('hidden regeneration clamps at 100 and dread cannot fall below zero', () => {
  const result = stepRunState(
    create({ floor: 7, timeLeft: 9999, battery: 99, stamina: 99, dread: 0 }),
    1,
    { hidden: true, nearest: 99 },
  );

  assert.equal(result.state.battery, 100);
  assert.equal(result.state.stamina, 100);
  assert.equal(result.state.dread, 0);
});

test('hidden run forces ascension when the mission clock expires', () => {
  const result = stepRunState(create({ floor: 3, timeLeft: 0.5 }), 1, { hidden: true });

  assert.equal(result.events.forcedAscend, 'time');
  assert.equal(result.state.floor, 4);
  assert.equal(result.state.dread, 18);
  assert.equal(result.state.timeLeft, 180);
  assert.equal(result.state.rescueT, -1);
  assert.equal(result.state.ended, false);
});

test('hidden run forces ascension when dread reaches 100', () => {
  const result = stepRunState(create({ dread: 99, timeLeft: 10 }), 1, {
    hidden: true,
    nearest: 0,
  });

  assert.equal(result.events.forcedAscend, 'dread');
  assert.equal(result.state.floor, 2);
  assert.equal(result.state.timeLeft, 180);
});

test('running drains stamina only while moving', () => {
  const running = stepRunState(create({ stamina: 50 }), 1, { moving: true, running: true });
  assert.equal(running.state.stamina, 30);

  const standing = stepRunState(create({ stamina: 50 }), 1, { moving: false, running: true });
  assert.equal(standing.state.stamina, 61);
});

test('empty stamina falls back to walking regeneration', () => {
  const result = stepRunState(create({ stamina: 0 }), 1, { moving: true, running: true });

  assert.equal(result.state.stamina, 11);
});

test('stamina clamps to its bounds', () => {
  const topped = stepRunState(create({ stamina: 99.5 }), 1, { moving: true });
  assert.equal(topped.state.stamina, 100);

  const emptied = stepRunState(create({ stamina: 0.5 }), 1, { moving: true, running: true });
  assert.equal(emptied.state.stamina, 0);
});

test('torch battery drains while on and switches the torch off at zero', () => {
  const drained = stepRunState(create({ battery: 50, torchOn: true }), 1);
  assertClose(drained.state.battery, 47.4, 'battery');
  assert.equal(drained.state.torchOn, true);

  const empty = stepRunState(create({ battery: 2, torchOn: true }), 1);
  assert.equal(empty.state.battery, 0);
  assert.equal(empty.state.torchOn, false);
});

test('torch battery regenerates while off and clamps at 100', () => {
  const regen = stepRunState(create({ battery: 50, torchOn: false }), 1);
  assertClose(regen.state.battery, 57, 'battery');

  const topped = stepRunState(create({ battery: 97, torchOn: false }), 1);
  assert.equal(topped.state.battery, 100);
});

test('interior dread rises near a window and creeps with elapsed time', () => {
  const nearWindow = stepRunState(create({ dread: 0 }), 1, { windowDistance: 0 });
  assertClose(nearWindow.state.dread, 8.5, 'dread near window');

  const atEdge = stepRunState(create({ dread: 0 }), 1, { windowDistance: 3 });
  assertClose(atEdge.state.dread, 0.5, 'exactly 3 is outside the window pull');

  const halfTime = stepRunState(create({ dread: 10, timeLeft: 90 }), 1, {
    windowDistance: Infinity,
  });
  assertClose(halfTime.state.dread, 10.875, 'dread at half time');
});

test('moving away from the window reduces the dread pull', () => {
  const away = stepRunState(create({ dread: 0 }), 1, {
    windowDistance: 0,
    moving: true,
    windowDot: -0.5,
  });
  assertClose(away.state.dread, 7.9, 'walking away');

  const toward = stepRunState(create({ dread: 0 }), 1, {
    windowDistance: 0,
    moving: true,
    windowDot: 0.8,
  });
  assertClose(toward.state.dread, 8.5, 'walking toward');

  const boundary = stepRunState(create({ dread: 0 }), 1, {
    windowDistance: 0,
    moving: true,
    windowDot: -0.2,
  });
  assertClose(boundary.state.dread, 8.5, 'exactly -0.2 is not away');
});

test('interior dread clamps at 100 and attracts a forced ascension', () => {
  const result = stepRunState(create({ dread: 99.9, timeLeft: 5 }), 1);

  assert.equal(result.events.forcedAscend, 'dread');
  assert.equal(result.state.floor, 2);
  assert.equal(result.state.dread, 18);
});

test('an expired clock forces ascension before the dread threshold is read', () => {
  const result = stepRunState(create({ dread: 100, timeLeft: 0.1 }), 1);

  assert.equal(result.events.forcedAscend, 'time');
  assert.equal(result.state.floor, 2);
});

test('forced ascension onto the rooftop resets temptation and grants the memento lifelines', () => {
  const result = stepRunState(
    create({ floor: 6, dread: 100, timeLeft: 10, mementos: 3, lifelines: 0 }),
    1,
  );

  assert.equal(result.events.forcedAscend, 'dread');
  assert.equal(result.state.floor, 7);
  assert.equal(result.state.timeLeft, 9999);
  assert.equal(result.state.temptation, 0);
  assert.equal(result.state.lifelines, 3);
  assert.equal(result.state.dread, 18);
  assert.equal(result.state.carreton, false);
});

test('carreton fires once when dread crosses 70', () => {
  const first = stepRunState(create({ dread: 69.9 }), 1);
  assertClose(first.state.dread, 70.4, 'dread');
  assert.equal(first.events.carreton, true);
  assert.equal(first.state.carreton, true);

  const second = stepRunState(first.state, 1);
  assert.equal(second.events.carreton, false);
  assert.equal(second.state.carreton, true);
});

test('carreton is checked before the rooftop branch like the original frame', () => {
  const result = stepRunState(create({ floor: 7, timeLeft: 9999, dread: 69.9 }), 1, {
    ledgeDistance: 6,
  });

  assert.equal(result.events.carreton, true);
});

test('the rooftop never ticks the clock or forces ascension', () => {
  const result = stepRunState(create({ floor: 7, timeLeft: 0.1, dread: 99.9 }), 1, {
    ledgeDistance: 6,
  });

  assert.equal(result.state.timeLeft, 0.1);
  assert.equal(result.state.dread, 100);
  assert.equal(result.events.forcedAscend, null);
  // Dread creeps to 100 first, so the rise is 0.5 + 1.7 * 1 = 2.2.
  assertClose(result.state.temptation, 2.2, 'temptation');
});

test('rooftop temptation rises from dread and ledge proximity', () => {
  const calm = stepRunState(create({ floor: 7, timeLeft: 9999 }), 1, { ledgeDistance: 6 });
  // Dread creeps 0.5 first, contributing 0.5% of the 1.7 dread weight.
  assertClose(calm.state.temptation, 0.5085, 'calm');

  const edge = stepRunState(create({ floor: 7, timeLeft: 9999, dread: 100 }), 1, {
    ledgeDistance: 0,
  });
  assertClose(edge.state.temptation, 3.8, 'at the ledge');
});

test('mementos slow the rooftop temptation rise and cap the bonus', () => {
  const three = stepRunState(create({ floor: 7, timeLeft: 9999, mementos: 3 }), 1, {
    ledgeDistance: 6,
  });
  assertClose(three.state.temptation, 0.5085 * (1 - 0.33), 'three mementos');

  const capped = stepRunState(create({ floor: 7, timeLeft: 9999, mementos: 10 }), 1, {
    ledgeDistance: 6,
  });
  assertClose(capped.state.temptation, 0.5085 * (1 - 0.66), 'cap at 66% slower');
});

test('holding Space pushes temptation down and clamps it at zero', () => {
  const resisted = stepRunState(
    create({ floor: 7, timeLeft: 9999, temptation: 10 }),
    1,
    { ledgeDistance: 6, holdingSpace: true },
  );
  assertClose(resisted.state.temptation, 10 + 0.5085 - 5.2, 'resisted');

  const atZero = stepRunState(create({ floor: 7, timeLeft: 9999, temptation: 2 }), 1, {
    ledgeDistance: 6,
    holdingSpace: true,
  });
  assert.equal(atZero.state.temptation, 0);
});

test('a lifeline catches temptation at 92 and resets it to 52', () => {
  const result = stepRunState(
    create({
      floor: 7,
      timeLeft: 9999,
      dread: 100,
      temptation: 91.5,
      lifelines: 2,
      mementos: 2,
    }),
    1,
    { ledgeDistance: 6 },
  );

  assert.equal(result.events.lifelineUsed, true);
  assert.equal(result.state.temptation, 52);
  assert.equal(result.state.lifelines, 1);
  assert.equal(result.state.ended, false);
  assert.equal(result.events.jumpEnding, false);
});

test('temptation at 100 ends the run with the jump ending', () => {
  const result = stepRunState(
    create({ floor: 7, timeLeft: 9999, dread: 100, temptation: 99 }),
    1,
    { ledgeDistance: 6 },
  );

  assert.equal(result.state.temptation, 100);
  assert.equal(result.events.jumpEnding, true);
  assert.equal(result.state.ended, true);
  assert.equal(result.state.ending, 'jumped');
});

test('a remaining lifeline prevents the jump ending at the same threshold', () => {
  const result = stepRunState(
    create({ floor: 7, timeLeft: 9999, dread: 100, temptation: 99, lifelines: 1 }),
    1,
    { ledgeDistance: 6 },
  );

  assert.equal(result.events.jumpEnding, false);
  assert.equal(result.events.lifelineUsed, true);
  assert.equal(result.state.temptation, 52);
  assert.equal(result.state.lifelines, 0);
  assert.equal(result.state.ended, false);
});

test('rooftop rescue countdown ends the run as rescued', () => {
  const result = stepRunState(create({ floor: 7, timeLeft: 9999, rescueT: 0.5 }), 1, {
    ledgeDistance: 6,
  });

  assert.equal(result.events.rescuedEnding, true);
  assert.equal(result.state.ended, true);
  assert.equal(result.state.ending, 'rescued');
});

test('the jump ending wins over an expiring rescue on the rooftop', () => {
  const result = stepRunState(
    create({ floor: 7, timeLeft: 9999, dread: 100, temptation: 99, rescueT: 0.5 }),
    1,
    { ledgeDistance: 6 },
  );

  assert.equal(result.events.jumpEnding, true);
  assert.equal(result.events.rescuedEnding, false);
});

test('the rescue ending wins over expiring time and dread indoors', () => {
  const result = stepRunState(create({ timeLeft: 0.2, dread: 100, rescueT: 0.5 }), 1);

  assert.equal(result.events.rescuedEnding, true);
  assert.equal(result.events.forcedAscend, null);
  assert.equal(result.state.ended, true);
});

test('hidden rescue countdown also ends the run before the hidden clock check', () => {
  const result = stepRunState(create({ timeLeft: 0.2, rescueT: 0.5 }), 1, { hidden: true });

  assert.equal(result.events.rescuedEnding, true);
  assert.equal(result.events.forcedAscend, null);
});

test('a positive rescueT input starts the countdown exactly once', () => {
  const started = stepRunState(create({ floor: 7, timeLeft: 9999 }), 1, {
    ledgeDistance: 6,
    rescueT: 50,
  });
  assert.equal(started.state.rescueT, 49);

  const next = stepRunState(started.state, 1, { ledgeDistance: 6, rescueT: 50 });
  assert.equal(next.state.rescueT, 48);

  const finished = stepRunState(next.state, 48, { ledgeDistance: 6 });
  assert.equal(finished.events.rescuedEnding, true);
  assert.equal(finished.state.ended, true);
});

test('an ended run ignores further frames', () => {
  const jumped = stepRunState(
    create({ floor: 7, timeLeft: 9999, dread: 100, temptation: 99 }),
    1,
    { ledgeDistance: 6 },
  );
  assert.equal(jumped.state.ended, true);

  const after = stepRunState(jumped.state, 1, { ledgeDistance: 0, holdingSpace: false });
  assert.deepEqual(after.state, jumped.state);
  assertNoEvents(after.events);
});

test('invalid and zero delta times leave the state untouched', () => {
  const state = create({
    dread: 40,
    stamina: 40,
    battery: 40,
    temptation: 20,
    timeLeft: 100,
  });
  const snapshot = structuredClone(state);

  for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
    const result = stepRunState(state, dt, { hidden: true, nearest: 0 });
    assert.deepEqual(result.state, snapshot);
    assertNoEvents(result.events);
  }
  assert.deepEqual(state, snapshot);
});

test('non-finite inputs fall back to neutral distances instead of corrupting state', () => {
  const hidden = stepRunState(create({ dread: 10 }), 1, {
    hidden: true,
    nearest: Number.NaN,
  });
  assertClose(hidden.state.dread, 8.4, 'hidden dread');

  const interior = stepRunState(create({ dread: 10 }), 1, {
    windowDistance: Number.NaN,
    ledgeDistance: Number.NaN,
  });
  assertClose(interior.state.dread, 10.5, 'interior dread');
});

test('stepRunState returns a new state without mutating its input', () => {
  const state = create({ dread: 10, stamina: 40 });
  const snapshot = structuredClone(state);

  const result = stepRunState(state, 0.5);

  assert.notEqual(result.state, state);
  assert.deepEqual(state, snapshot);
  assertClose(result.state.dread, 10.25, 'dread');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { createInputController } from '../public/input.mjs';

const LOOK_FACTOR = 0.0022;

function createFakeEventSource() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    emit(type, event) {
      for (const handler of [...(listeners.get(type) || [])]) handler(event);
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
    totalListeners() {
      let total = 0;
      for (const handlers of listeners.values()) total += handlers.size;
      return total;
    },
  };
}

function createFakeDocument() {
  const doc = createFakeEventSource();
  doc.pointerLockElement = null;
  doc.hidden = false;
  return doc;
}

function makeEvent(init = {}) {
  return {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...init,
  };
}

function createHarness(options = {}) {
  const target = createFakeEventSource();
  const document = createFakeDocument();
  const actions = [];
  const input = createInputController({
    target,
    document,
    onAction(action) {
      actions.push(action);
    },
    ...options,
  });
  return { target, document, actions, input };
}

function assertClose(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `expected ${actual} to be close to ${expected}`,
  );
}

test('starts with a neutral state shape', () => {
  const { input } = createHarness();

  assert.deepEqual(input.getState(), {
    keys: {},
    yaw: 0,
    pitch: 0,
    cursor: null,
    pointerLocked: false,
    fallbackLook: false,
  });
});

test('tracks event.code on keydown and keyup and prevents default for movement keys', () => {
  const { target, input } = createHarness();
  input.bind();

  const keyW = makeEvent({ code: 'KeyW', key: 'z' });
  target.emit('keydown', keyW);
  assert.equal(input.getState().keys.KeyW, true);
  assert.equal(keyW.defaultPrevented, true);

  for (const code of ['KeyA', 'KeyS', 'KeyD', 'Space']) {
    const event = makeEvent({ code });
    target.emit('keydown', event);
    assert.equal(input.getState().keys[code], true);
    assert.equal(event.defaultPrevented, true);
  }

  const other = makeEvent({ code: 'KeyQ' });
  target.emit('keydown', other);
  assert.equal(input.getState().keys.KeyQ, true);
  assert.equal(other.defaultPrevented, false);

  const keyUp = makeEvent({ code: 'KeyW' });
  target.emit('keyup', keyUp);
  assert.equal(input.getState().keys.KeyW, false);
  assert.equal(keyUp.defaultPrevented, false);
});

test('ignores keyboard events from editable targets', () => {
  const { target, actions, input } = createHarness();
  input.bind();

  target.emit('keydown', makeEvent({ code: 'KeyW' }));
  assert.equal(input.getState().keys.KeyW, true);

  for (const node of [
    { tagName: 'INPUT' },
    { tagName: 'TEXTAREA' },
    { tagName: 'SELECT' },
    { tagName: 'DIV', isContentEditable: true },
  ]) {
    const keyDown = makeEvent({ code: 'KeyW', target: node });
    target.emit('keydown', keyDown);
    assert.equal(keyDown.defaultPrevented, false);

    target.emit('keyup', makeEvent({ code: 'KeyW', target: node }));
  }

  assert.equal(input.getState().keys.KeyW, true);

  target.emit('keydown', makeEvent({ code: 'KeyF', target: { tagName: 'INPUT' } }));
  assert.deepEqual(actions, []);
});

test('emits torch, hide and fallback-only pause actions', () => {
  const { target, actions, input } = createHarness();
  input.bind();

  target.emit('keydown', makeEvent({ code: 'KeyF' }));
  target.emit('keydown', makeEvent({ code: 'KeyE' }));
  target.emit('keydown', makeEvent({ code: 'Escape' }));
  assert.deepEqual(actions, [{ type: 'torchToggle' }, { type: 'hideToggle' }]);

  input.setFallbackLook(true);
  target.emit('keydown', makeEvent({ code: 'Escape' }));
  assert.deepEqual(actions, [
    { type: 'torchToggle' },
    { type: 'hideToggle' },
    { type: 'pause' },
  ]);
});

test('applies mouse look while pointer locked', () => {
  const { document, input } = createHarness();
  input.bind();

  input.setFallbackLook(true);
  document.pointerLockElement = {};
  document.emit('pointerlockchange');
  assert.equal(input.getState().pointerLocked, true);
  assert.equal(input.getState().fallbackLook, false);

  document.emit('mousemove', makeEvent({
    clientX: 40,
    clientY: 20,
    movementX: 100,
    movementY: 50,
  }));

  const state = input.getState();
  assertClose(state.yaw, -100 * 0.55 * LOOK_FACTOR);
  assertClose(state.pitch, -50 * 0.55 * LOOK_FACTOR);
  assert.deepEqual(state.cursor, { x: 40, y: 20 });
});

test('clamps pitch to the look limits', () => {
  const { document, input } = createHarness();
  input.bind();
  document.pointerLockElement = {};
  document.emit('pointerlockchange');

  document.emit('mousemove', makeEvent({
    clientX: 0,
    clientY: 0,
    movementX: 0,
    movementY: 10000,
  }));
  assert.equal(input.getState().pitch, -1.2);

  document.emit('mousemove', makeEvent({
    clientX: 0,
    clientY: 0,
    movementX: 0,
    movementY: -10000,
  }));
  assert.equal(input.getState().pitch, 1.2);
});

test('ignores mouse look when isActive is false but still records the cursor', () => {
  let active = false;
  const { document, input } = createHarness({ isActive: () => active });
  input.bind();
  document.pointerLockElement = {};
  document.emit('pointerlockchange');

  document.emit('mousemove', makeEvent({
    clientX: 7,
    clientY: 9,
    movementX: 100,
    movementY: 100,
  }));
  let state = input.getState();
  assert.equal(state.yaw, 0);
  assert.equal(state.pitch, 0);
  assert.deepEqual(state.cursor, { x: 7, y: 9 });

  active = true;
  document.emit('mousemove', makeEvent({
    clientX: 8,
    clientY: 10,
    movementX: 100,
    movementY: 50,
  }));
  state = input.getState();
  assertClose(state.yaw, -100 * 0.55 * LOOK_FACTOR);
  assertClose(state.pitch, -50 * 0.55 * LOOK_FACTOR);
});

test('keeps fallback look usable after pointer lock is lost', () => {
  const { document, input } = createHarness();
  input.bind();

  document.pointerLockElement = {};
  document.emit('pointerlockchange');
  input.setFallbackLook(true);
  assert.equal(input.getState().fallbackLook, true);

  document.pointerLockElement = null;
  document.emit('pointerlockchange');
  let state = input.getState();
  assert.equal(state.pointerLocked, false);
  assert.equal(state.fallbackLook, true);

  document.emit('mousemove', makeEvent({
    clientX: 1,
    clientY: 2,
    movementX: 10,
    movementY: 0,
  }));
  state = input.getState();
  assertClose(state.yaw, -10 * 0.55 * LOOK_FACTOR);
});

test('ignores mouse look without pointer lock or fallback look', () => {
  const { document, input } = createHarness();
  input.bind();

  document.emit('mousemove', makeEvent({
    clientX: 5,
    clientY: 6,
    movementX: 100,
    movementY: 100,
  }));
  let state = input.getState();
  assert.equal(state.yaw, 0);
  assert.equal(state.pitch, 0);
  assert.deepEqual(state.cursor, { x: 5, y: 6 });

  input.setFallbackLook(true);
  document.emit('mousemove', makeEvent({
    clientX: 5,
    clientY: 6,
    movementX: 100,
    movementY: 0,
  }));
  state = input.getState();
  assertClose(state.yaw, -100 * 0.55 * LOOK_FACTOR);
});

test('setSensitivity scales mouse look deltas', () => {
  const { document, input } = createHarness();
  input.bind();
  input.setFallbackLook(true);

  document.emit('mousemove', makeEvent({
    clientX: 0,
    clientY: 0,
    movementX: 100,
    movementY: 0,
  }));
  assertClose(input.getState().yaw, -100 * 0.55 * LOOK_FACTOR);

  input.resetLook();
  input.setSensitivity(1);
  document.emit('mousemove', makeEvent({
    clientX: 0,
    clientY: 0,
    movementX: 100,
    movementY: 0,
  }));
  assertClose(input.getState().yaw, -100 * LOOK_FACTOR);

  input.resetLook();
  input.setSensitivity(0);
  document.emit('mousemove', makeEvent({
    clientX: 0,
    clientY: 0,
    movementX: 100,
    movementY: 0,
  }));
  assert.equal(input.getState().yaw, 0);
});

test('emits visibility actions with the hidden flag', () => {
  const { document, actions, input } = createHarness();
  input.bind();

  document.hidden = true;
  document.emit('visibilitychange');
  document.hidden = false;
  document.emit('visibilitychange');

  assert.deepEqual(actions, [
    { type: 'visibility', hidden: true },
    { type: 'visibility', hidden: false },
  ]);
});

test('bind attaches listeners once and unbind is idempotent', () => {
  const target = createFakeEventSource();
  const document = createFakeDocument();
  const actions = [];
  const input = createInputController({
    target,
    document,
    onAction(action) {
      actions.push(action);
    },
  });

  input.bind();
  input.bind();
  assert.equal(target.listenerCount('keydown'), 1);
  assert.equal(target.listenerCount('keyup'), 1);
  assert.equal(document.listenerCount('mousemove'), 1);
  assert.equal(document.listenerCount('pointerlockchange'), 1);
  assert.equal(document.listenerCount('visibilitychange'), 1);

  target.emit('keydown', makeEvent({ code: 'KeyF' }));
  assert.equal(actions.length, 1);

  input.unbind();
  input.unbind();
  assert.equal(target.totalListeners(), 0);
  assert.equal(document.totalListeners(), 0);

  const afterUnbind = makeEvent({ code: 'KeyW' });
  target.emit('keydown', afterUnbind);
  assert.equal(input.getState().keys.KeyW, undefined);
  assert.equal(afterUnbind.defaultPrevented, false);
  assert.equal(actions.length, 1);

  input.bind();
  target.emit('keydown', makeEvent({ code: 'KeyF' }));
  assert.equal(actions.length, 2);
  input.unbind();
});

test('resetLook clears yaw and pitch without clearing keys or cursor', () => {
  const { target, document, input } = createHarness();
  input.bind();
  input.setFallbackLook(true);
  target.emit('keydown', makeEvent({ code: 'KeyW' }));
  document.emit('mousemove', makeEvent({
    clientX: 3,
    clientY: 4,
    movementX: 20,
    movementY: -40,
  }));

  const before = input.getState();
  assert.notEqual(before.yaw, 0);
  assert.notEqual(before.pitch, 0);

  input.resetLook();
  const after = input.getState();
  assert.equal(after.yaw, 0);
  assert.equal(after.pitch, 0);
  assert.equal(after.keys.KeyW, true);
  assert.deepEqual(after.cursor, { x: 3, y: 4 });
});

test('setLook writes clamped yaw and pitch for fallback steering', () => {
  const { input } = createHarness();

  input.setLook(1.25, -4);
  let state = input.getState();
  assert.equal(state.yaw, 1.25);
  assert.equal(state.pitch, -1.2);

  input.setLook(Number.NaN, 2);
  state = input.getState();
  assert.equal(state.yaw, 1.25);
  assert.equal(state.pitch, 1.2);
});

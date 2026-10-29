import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameLoop } from '../public/engine-loop.mjs';

function createFrameQueue() {
  const pending = [];
  const cancelled = [];
  let nextId = 1;

  return {
    pending,
    cancelled,
    requestFrame(callback) {
      const id = nextId;
      nextId += 1;
      pending.push({ id, callback });
      return id;
    },
    cancelFrame(id) {
      cancelled.push(id);
      const index = pending.findIndex((frame) => frame.id === id);
      if (index !== -1) pending.splice(index, 1);
    },
    flush(timestamp) {
      const frame = pending.shift();
      assert.ok(frame, 'expected a pending frame');
      frame.callback(timestamp);
      return frame.id;
    },
  };
}

function createRecorder() {
  const events = [];
  return {
    events,
    update(dt, timestamp) {
      events.push(['update', dt, timestamp]);
    },
    render(dt, timestamp) {
      events.push(['render', dt, timestamp]);
    },
  };
}

function createLoop(frames, recorder, options = {}) {
  return createGameLoop({
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
    update: recorder.update,
    render: recorder.render,
    ...options,
  });
}

test('start schedules one frame, reports running, and is idempotent', () => {
  const frames = createFrameQueue();
  const recorder = createRecorder();
  const loop = createLoop(frames, recorder);

  assert.equal(loop.isRunning(), false);
  loop.start();
  assert.equal(loop.isRunning(), true);
  assert.equal(frames.pending.length, 1);

  loop.start();
  assert.equal(frames.pending.length, 1);
  assert.deepEqual(recorder.events, []);
});

test('frames update before rendering with delta in clamped seconds', () => {
  const frames = createFrameQueue();
  const recorder = createRecorder();
  const loop = createLoop(frames, recorder);

  loop.start();
  frames.flush(1_000);

  assert.deepEqual(recorder.events, [
    ['update', 0, 1_000],
    ['render', 0, 1_000],
  ]);

  recorder.events.length = 0;
  frames.flush(1_016);

  assert.deepEqual(recorder.events, [
    ['update', 0.016, 1_016],
    ['render', 0.016, 1_016],
  ]);
  assert.equal(frames.pending.length, 1);
});

test('delta is clamped to maxDelta', () => {
  const frames = createFrameQueue();
  const recorder = createRecorder();
  const loop = createLoop(frames, recorder);

  loop.start();
  frames.flush(0);
  recorder.events.length = 0;
  frames.flush(5_000);

  assert.deepEqual(recorder.events, [
    ['update', 0.05, 5_000],
    ['render', 0.05, 5_000],
  ]);

  const customFrames = createFrameQueue();
  const customRecorder = createRecorder();
  const custom = createLoop(customFrames, customRecorder, { maxDelta: 0.2 });

  custom.start();
  customFrames.flush(0);
  customRecorder.events.length = 0;
  customFrames.flush(1_000);

  assert.deepEqual(customRecorder.events, [
    ['update', 0.2, 1_000],
    ['render', 0.2, 1_000],
  ]);
});

test('backward timestamps never produce a negative delta', () => {
  const frames = createFrameQueue();
  const recorder = createRecorder();
  const loop = createLoop(frames, recorder);

  loop.start();
  frames.flush(1_000);
  recorder.events.length = 0;
  frames.flush(900);

  assert.deepEqual(recorder.events, [
    ['update', 0, 900],
    ['render', 0, 900],
  ]);
});

test('missing timestamps fall back to now()', () => {
  const frames = createFrameQueue();
  const recorder = createRecorder();
  const times = [500, 508];
  const loop = createLoop(frames, recorder, { now: () => times.shift() });

  loop.start();
  frames.flush();
  frames.flush(null);

  assert.deepEqual(recorder.events, [
    ['update', 0, 500],
    ['render', 0, 500],
    ['update', 0.008, 508],
    ['render', 0.008, 508],
  ]);
  assert.deepEqual(times, []);
});

test('stop cancels the pending frame and is idempotent', () => {
  const frames = createFrameQueue();
  const recorder = createRecorder();
  const loop = createLoop(frames, recorder);

  loop.stop();
  assert.equal(loop.isRunning(), false);
  assert.deepEqual(frames.cancelled, []);

  loop.start();
  const scheduled = frames.pending[0].id;
  loop.stop();
  loop.stop();

  assert.equal(loop.isRunning(), false);
  assert.deepEqual(frames.cancelled, [scheduled]);
  assert.equal(frames.pending.length, 0);
});

test('a frame delivered after stop is ignored', () => {
  const frames = createFrameQueue();
  const recorder = createRecorder();
  const loop = createLoop(frames, recorder);

  loop.start();
  const lateFrame = frames.pending[0].callback;
  loop.stop();
  lateFrame(2_000);

  assert.deepEqual(recorder.events, []);
  assert.equal(frames.pending.length, 0);
  assert.equal(loop.isRunning(), false);
});

test('a handler that stops the loop prevents the next frame', () => {
  const frames = createFrameQueue();
  const events = [];
  let loop;
  loop = createGameLoop({
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
    update: () => {
      events.push('update');
      loop.stop();
    },
    render: () => {
      events.push('render');
    },
  });

  loop.start();
  frames.flush(0);

  assert.deepEqual(events, ['update', 'render']);
  assert.equal(loop.isRunning(), false);
  assert.equal(frames.pending.length, 0);
});

test('update throwing stops the loop and rethrows', () => {
  const frames = createFrameQueue();
  const rendered = [];
  const loop = createGameLoop({
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
    update: () => {
      throw new Error('update boom');
    },
    render: () => {
      rendered.push('render');
    },
  });

  loop.start();
  assert.throws(() => frames.flush(1_000), /update boom/);

  assert.equal(loop.isRunning(), false);
  assert.equal(frames.pending.length, 0);
  assert.deepEqual(rendered, []);
});

test('render throwing stops the loop and rethrows', () => {
  const frames = createFrameQueue();
  const events = [];
  const loop = createGameLoop({
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
    update: (dt, timestamp) => {
      events.push(['update', dt, timestamp]);
    },
    render: () => {
      throw new Error('render boom');
    },
  });

  loop.start();
  assert.throws(() => frames.flush(1_000), /render boom/);

  assert.deepEqual(events, [['update', 0, 1_000]]);
  assert.equal(loop.isRunning(), false);
  assert.equal(frames.pending.length, 0);
});

test('tick runs one frame synchronously without starting or scheduling', () => {
  const frames = createFrameQueue();
  const recorder = createRecorder();
  const loop = createLoop(frames, recorder);

  loop.tick(1_000);
  loop.tick(1_016);

  assert.deepEqual(recorder.events, [
    ['update', 0, 1_000],
    ['render', 0, 1_000],
    ['update', 0.016, 1_016],
    ['render', 0.016, 1_016],
  ]);
  assert.equal(loop.isRunning(), false);
  assert.equal(frames.pending.length, 0);
});

test('tick while running shares the delta baseline without adding a frame', () => {
  const frames = createFrameQueue();
  const recorder = createRecorder();
  const loop = createLoop(frames, recorder);

  loop.start();
  loop.tick(1_000);
  assert.equal(frames.pending.length, 1);

  frames.flush(1_016);

  assert.deepEqual(recorder.events, [
    ['update', 0, 1_000],
    ['render', 0, 1_000],
    ['update', 0.016, 1_016],
    ['render', 0.016, 1_016],
  ]);
  assert.equal(frames.pending.length, 1);
});

test('tick that throws stops a running loop and rethrows', () => {
  const frames = createFrameQueue();
  let calls = 0;
  const loop = createGameLoop({
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
    update: () => {
      calls += 1;
      throw new Error('tick boom');
    },
    render: () => {},
  });

  loop.start();
  const scheduled = frames.pending[0].id;
  assert.throws(() => loop.tick(1_000), /tick boom/);

  assert.equal(calls, 1);
  assert.equal(loop.isRunning(), false);
  assert.deepEqual(frames.cancelled, [scheduled]);
  assert.equal(frames.pending.length, 0);
});

test('start after stop rebaselines the delta and schedules one frame', () => {
  const frames = createFrameQueue();
  const recorder = createRecorder();
  const loop = createLoop(frames, recorder);

  loop.start();
  frames.flush(1_000);
  loop.stop();
  assert.equal(frames.pending.length, 0);

  recorder.events.length = 0;
  loop.start();
  assert.equal(frames.pending.length, 1);

  frames.flush(60_000);

  assert.deepEqual(recorder.events, [
    ['update', 0, 60_000],
    ['render', 0, 60_000],
  ]);
});

// Injectable requestAnimationFrame game loop.
//
// `createGameLoop(options)` returns `{ start, stop, isRunning, tick }` and owns
// the frame scheduling state. It has no imports, no DOM access, and no timers:
// every platform dependency is injected, so tests drive it with a fake queue.
// `requestFrame` must invoke its callback asynchronously, as
// `requestAnimationFrame` does; `tick()` is the synchronous entry point.
//
// Contract:
// - `start()` is idempotent. It marks the loop running and requests exactly one
//   frame. Each start begins a fresh delta baseline, so the first frame after a
//   start always receives `dt = 0`.
// - A scheduled frame resolves its timestamp (a missing or non-finite value
//   falls back to `now()`), computes
//   `dt = clamp((timestamp - last) / 1000, 0, maxDelta)`, records the
//   timestamp, calls `update(dt, timestamp)`, then `render(dt, timestamp)`, and
//   requests the next frame only while the loop is still running.
// - If `update` or `render` throws, the loop stops (cancelling any pending
//   frame) and the error is rethrown.
// - `stop()` is idempotent. It stops scheduling and cancels the pending frame.
//   A frame delivered late, after `stop()`, is ignored.
// - `tick(timestamp)` runs exactly one frame synchronously through the same
//   path and delta baseline, whether or not the loop is running, and never
//   schedules a follow-up frame. If a handler throws, the loop stops and the
//   error is rethrown.
// - `isRunning()` reports whether the loop is between `start()` and
//   `stop()`/failure.

export function createGameLoop({
  requestFrame = (callback) => globalThis.requestAnimationFrame(callback),
  cancelFrame = (handle) => globalThis.cancelAnimationFrame(handle),
  now = () => globalThis.performance.now(),
  update = () => {},
  render = () => {},
  maxDelta = 0.05,
} = {}) {
  const deltaLimit = Number.isFinite(maxDelta) ? Math.max(0, maxDelta) : 0.05;
  let running = false;
  let pending = null;
  let lastTimestamp = null;
  let generation = 0;

  function resolveTimestamp(timestamp) {
    if (Number.isFinite(timestamp)) return timestamp;
    const current = now();
    if (Number.isFinite(current)) return current;
    return lastTimestamp === null ? 0 : lastTimestamp;
  }

  function runFrame(timestamp) {
    const frameTime = resolveTimestamp(timestamp);
    const elapsed = lastTimestamp === null ? 0 : (frameTime - lastTimestamp) / 1000;
    const dt = Math.max(0, Math.min(elapsed, deltaLimit));
    lastTimestamp = frameTime;
    try {
      update(dt, frameTime);
      render(dt, frameTime);
    } catch (error) {
      stop();
      throw error;
    }
  }

  function requestNextFrame() {
    if (pending !== null) return;
    const token = ++generation;
    pending = requestFrame((timestamp) => {
      if (token !== generation) return;
      pending = null;
      if (!running) return;
      runFrame(timestamp);
      if (running) requestNextFrame();
    });
  }

  function start() {
    if (running) return;
    running = true;
    lastTimestamp = null;
    requestNextFrame();
  }

  function stop() {
    running = false;
    lastTimestamp = null;
    generation += 1;
    if (pending !== null) {
      const frame = pending;
      pending = null;
      cancelFrame(frame);
    }
  }

  function tick(timestamp) {
    runFrame(timestamp);
  }

  function isRunning() {
    return running;
  }

  return { start, stop, isRunning, tick };
}

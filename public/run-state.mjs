/**
 * Pure run-state rules for a Torres del Sisal run.
 *
 * This module has no imports, DOM, Three.js, network, storage or timers: every
 * rule is a function of the previous state, the elapsed seconds and one frame
 * of observations.
 *
 * `createRunState` takes the resolved config from `getDifficultyConfig(name)`
 * because this module intentionally cannot import the rules table.
 *
 * Frame input (all optional):
 * - `hidden`: the player is inside a hide spot.
 * - `nearest`: distance to the nearest threat (drives hidden dread).
 * - `windowDistance`: distance to the nearest opening (interior pull).
 * - `windowDot`: normalized movement dot toward the nearest opening; values
 *   below -0.2 mean walking away and reduce dread exactly like the original.
 * - `moving`: any movement key was pressed this frame.
 * - `running`: shift was held this frame; it only drains while moving and
 *   while stamina remains, matching `run = wantRun && stamina > 0`.
 * - `holdingSpace`: Space is held on the rooftop.
 * - `rooftop`: overrides the floor-derived rooftop state.
 * - `ledgeDistance`: distance to the rooftop ledge.
 * - `rescueT`: a positive value starts the rescue countdown once; a countdown
 *   already in progress is never restarted by it.
 *
 * `stepRunState` never mutates the state it receives and always returns a new
 * state object. Callers keep the returned state as authoritative.
 */

const ROOFTOP_FLOOR = 7;
const ROOFTOP_TIME_SENTINEL = 9999;
const MAX_DREAD = 100;
const MAX_STAMINA = 100;
const MAX_BATTERY = 100;
const MAX_TEMPTATION = 100;
const CARRETON_DREAD = 70;
const LIFELINE_TRIGGER = 92;
const LIFELINE_RESET = 52;
const JUMP_THRESHOLD = 100;
const RESCUE_IDLE = -1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeDifficulty(difficulty) {
  if (!difficulty || typeof difficulty !== 'object') {
    throw new TypeError(
      'createRunState needs the difficulty config from getDifficultyConfig(difficulty), not a difficulty name.',
    );
  }
  const time = finiteOr(difficulty.time, NaN);
  const rescue = finiteOr(difficulty.rescue, NaN);
  const near = finiteOr(difficulty.near, NaN);
  const creep = finiteOr(difficulty.creep, NaN);
  if (!(time > 0) || !Number.isFinite(rescue) || !Number.isFinite(near) || !Number.isFinite(creep)) {
    throw new TypeError(
      'createRunState needs the difficulty config from getDifficultyConfig(difficulty) with finite time, rescue, near and creep.',
    );
  }
  return Object.freeze({
    time,
    rescue,
    pull: finiteOr(difficulty.pull, 0),
    near,
    creep,
  });
}

function createEvents() {
  return {
    forcedAscend: null,
    jumpEnding: false,
    rescuedEnding: false,
    lifelineUsed: false,
    carreton: false,
  };
}

function endRun(state, ending, events) {
  state.ended = true;
  state.ending = ending;
  if (ending === 'jumped') events.jumpEnding = true;
  else events.rescuedEnding = true;
  return state;
}

function tickRescue(state, dt, events) {
  if (!(state.rescueT > 0)) return false;
  state.rescueT -= dt;
  if (state.rescueT > 0) return false;
  endRun(state, 'rescued', events);
  return true;
}

function forceAscend(state, cause, events) {
  events.forcedAscend = cause;
  state.floor += 1;
  state.dread = 18;
  state.rescueT = RESCUE_IDLE;
  state.carreton = false;
  if (state.floor >= ROOFTOP_FLOOR) {
    state.timeLeft = ROOFTOP_TIME_SENTINEL;
    state.temptation = 0;
    state.lifelines = state.mementos;
  } else {
    state.timeLeft = state.difficulty.time;
  }
  return state;
}

export function createRunState({
  difficulty,
  floor = 1,
  mementos = 0,
  timeLeft,
  dread = 0,
  stamina = 100,
  battery = 100,
  torchOn = true,
  temptation = 0,
  lifelines = 0,
  rescueT = RESCUE_IDLE,
} = {}) {
  const config = normalizeDifficulty(difficulty);
  return {
    difficulty: config,
    floor: Math.max(1, Math.floor(finiteOr(floor, 1))),
    mementos: Math.max(0, Math.floor(finiteOr(mementos, 0))),
    timeLeft: finiteOr(timeLeft, config.time),
    dread: clamp(finiteOr(dread, 0), 0, MAX_DREAD),
    stamina: clamp(finiteOr(stamina, MAX_STAMINA), 0, MAX_STAMINA),
    battery: clamp(finiteOr(battery, MAX_BATTERY), 0, MAX_BATTERY),
    torchOn: Boolean(torchOn),
    temptation: clamp(finiteOr(temptation, 0), 0, MAX_TEMPTATION),
    lifelines: Math.max(0, Math.floor(finiteOr(lifelines, 0))),
    rescueT: finiteOr(rescueT, RESCUE_IDLE),
    carreton: false,
    ended: false,
    ending: null,
  };
}

export function stepRunState(state, dt, input = {}) {
  if (!state || typeof state !== 'object' || !state.difficulty) {
    throw new TypeError('stepRunState needs a state created by createRunState.');
  }

  const events = createEvents();
  if (!Number.isFinite(dt) || dt <= 0) return { state: { ...state }, events };

  const next = { ...state };
  if (next.ended) return { state: next, events };

  const config = next.difficulty;
  const frame = input && typeof input === 'object' ? input : {};
  const rooftop = frame.rooftop === undefined ? next.floor >= ROOFTOP_FLOOR : Boolean(frame.rooftop);
  const hidden = Boolean(frame.hidden);
  const nearest = finiteOr(frame.nearest, Infinity);
  const windowDistance = finiteOr(frame.windowDistance, Infinity);
  const ledgeDistance = finiteOr(frame.ledgeDistance, Infinity);
  const moving = Boolean(frame.moving);
  const running = Boolean(frame.running);
  const holdingSpace = Boolean(frame.holdingSpace);
  const windowDot = finiteOr(frame.windowDot, 0);

  if (Number.isFinite(frame.rescueT) && frame.rescueT > 0 && !(next.rescueT > 0)) {
    next.rescueT = frame.rescueT;
  }

  if (hidden) {
    next.battery = clamp(next.battery + 7 * dt, 0, MAX_BATTERY);
    next.stamina = clamp(next.stamina + 11 * dt, 0, MAX_STAMINA);
    const dreadDelta = nearest < 3.5 ? 2.4 : -1.6;
    next.dread = clamp(next.dread + dreadDelta * dt, 0, MAX_DREAD);
    if (rooftop) next.temptation = clamp(next.temptation - 9 * dt, 0, MAX_TEMPTATION);
    if (tickRescue(next, dt, events)) return { state: next, events };
    if (!rooftop) {
      next.timeLeft -= dt;
      if (next.timeLeft <= 0) return { state: forceAscend(next, 'time', events), events };
      if (next.dread >= MAX_DREAD) return { state: forceAscend(next, 'dread', events), events };
    }
    return { state: next, events };
  }

  const timeFactor = rooftop ? 0 : 1 - Math.max(0, next.timeLeft) / config.time;
  const effectiveRun = running && moving && next.stamina > 0;
  next.stamina = effectiveRun
    ? Math.max(0, next.stamina - 20 * dt)
    : Math.min(MAX_STAMINA, next.stamina + 11 * dt);

  if (next.torchOn) {
    next.battery = Math.max(0, next.battery - 2.6 * dt);
    if (next.battery <= 0) next.torchOn = false;
  } else {
    next.battery = Math.min(MAX_BATTERY, next.battery + 7 * dt);
  }

  let dread = next.dread;
  if (!rooftop && windowDistance < 3) dread += ((3 - windowDistance) / 3) * config.near * dt;
  if (!rooftop && moving && windowDot < -0.2) dread -= 1.2 * dt * (-windowDot);
  dread += (config.creep + timeFactor * 0.75) * dt;
  next.dread = clamp(dread, 0, MAX_DREAD);

  if (next.dread >= CARRETON_DREAD && !next.carreton) {
    next.carreton = true;
    events.carreton = true;
  }

  if (rooftop) {
    const near = Math.max(0, (6 - ledgeDistance) / 6);
    const slow = 1 - Math.min(0.66, next.mementos * 0.11);
    let rise = (0.5 + (next.dread / 100) * 1.7 + near * 1.6) * slow;
    if (holdingSpace) rise -= 5.2;
    next.temptation = clamp(next.temptation + rise * dt, 0, MAX_TEMPTATION);
    if (next.temptation >= LIFELINE_TRIGGER && next.lifelines > 0) {
      next.lifelines -= 1;
      next.temptation = LIFELINE_RESET;
      events.lifelineUsed = true;
    }
    if (next.temptation >= JUMP_THRESHOLD) return { state: endRun(next, 'jumped', events), events };
    if (tickRescue(next, dt, events)) return { state: next, events };
    return { state: next, events };
  }

  if (tickRescue(next, dt, events)) return { state: next, events };
  next.timeLeft -= dt;
  if (next.timeLeft <= 0) return { state: forceAscend(next, 'time', events), events };
  if (next.dread >= MAX_DREAD) return { state: forceAscend(next, 'dread', events), events };
  return { state: next, events };
}

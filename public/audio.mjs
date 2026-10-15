const KINDS = [
  'scream',
  'giggle',
  'whistle',
  'bones',
  'sob',
  'hooves',
  'scare',
  'squeak',
  'ring',
  'splash',
  'vanish',
  'chime',
  'ascend',
  'despair',
  'release',
];

export const AUDIO_KINDS = Object.freeze(new Set(KINDS));

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function giggleLevel(dist) {
  const d = Number(dist);
  if (!Number.isFinite(d)) return 0.14;
  return Math.min(0.14, 0.5 / Math.max(1, d));
}

export function sobLevel(dist) {
  const d = Number(dist);
  if (!Number.isFinite(d)) return 0.12;
  return Math.min(0.12, 0.4 / Math.max(1, d * 0.6));
}

export function squeakLevel(dist) {
  const d = Number(dist);
  if (!Number.isFinite(d)) return 0.08;
  return Math.min(0.08, 0.2 / Math.max(1, d));
}

export function whistleLevel(dist) {
  const d = Number(dist);
  if (!Number.isFinite(d)) return 0.02;
  return 0.02 + 0.13 * clamp01((d - 2) / 14);
}

export function levelFor(kind, dist) {
  switch (kind) {
    case 'giggle':
      return giggleLevel(dist);
    case 'sob':
      return sobLevel(dist);
    case 'squeak':
      return squeakLevel(dist);
    case 'whistle':
      return whistleLevel(dist);
    default:
      return null;
  }
}

export function createNullAudioEngine() {
  return {
    play(kind) {
      return AUDIO_KINDS.has(kind);
    },
    startAmbience() {},
    stop() {},
  };
}

export function createAudioEngine({ sink = null } = {}) {
  function play(kind, { dist = 1 } = {}) {
    if (!AUDIO_KINDS.has(kind)) return false;
    const fn = sink?.[kind];
    if (typeof fn !== 'function') return false;
    fn({ dist, level: levelFor(kind, dist) });
    return true;
  }

  function startAmbience() {
    sink?.startAmbience?.();
  }

  function stop() {
    sink?.stop?.();
  }

  return { play, startAmbience, stop };
}

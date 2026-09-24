const DIFFICULTIES = Object.freeze({
  Piadoso: Object.freeze({ time: 300, pull: 0.75, near: 5.5, spike: 20, rescue: 40, creep: 0.32 }),
  Normal: Object.freeze({ time: 180, pull: 1, near: 8, spike: 30, rescue: 50, creep: 0.5 }),
  Pesadilla: Object.freeze({ time: 150, pull: 1.5, near: 11, spike: 42, rescue: 65, creep: 0.7 }),
});

export function getDifficultyConfig(difficulty) {
  return DIFFICULTIES[difficulty] || DIFFICULTIES.Normal;
}

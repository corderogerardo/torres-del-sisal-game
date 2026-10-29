import assert from 'node:assert/strict';
import test from 'node:test';
import { createHud } from '../public/hud.mjs';

function fakeNode() {
  let value = null;
  let writes = 0;
  let offsetReads = 0;
  const events = [];
  const classCalls = [];
  const classes = new Set();
  const styleWrites = [];
  const style = new Proxy(
    {},
    {
      set(target, property, next) {
        styleWrites.push([property, next]);
        events.push(['style', property, next]);
        target[property] = next;
        return true;
      },
    },
  );
  const classList = {
    add(...args) {
      classCalls.push(['add', ...args]);
      events.push(['add', ...args]);
      for (const name of args) classes.add(name);
    },
    remove(...args) {
      classCalls.push(['remove', ...args]);
      events.push(['remove', ...args]);
      for (const name of args) classes.delete(name);
    },
    toggle(...args) {
      classCalls.push(['toggle', ...args]);
      events.push(['toggle', ...args]);
      const [name, force] = args;
      const on = force === undefined ? !classes.has(name) : Boolean(force);
      if (on) classes.add(name);
      else classes.delete(name);
      return on;
    },
    contains(name) {
      return classes.has(name);
    },
  };
  return {
    get textContent() {
      return value;
    },
    set textContent(v) {
      writes += 1;
      value = v;
      events.push(['text', v]);
    },
    get writeCount() {
      return writes;
    },
    get classCalls() {
      return classCalls;
    },
    get classes() {
      return classes;
    },
    get styleWrites() {
      return styleWrites;
    },
    get offsetReads() {
      return offsetReads;
    },
    get events() {
      return events;
    },
    get offsetWidth() {
      offsetReads += 1;
      events.push(['offsetWidth']);
      return 100;
    },
    classList,
    style,
  };
}

function fakeEls() {
  return {
    banner: fakeNode(),
    statLine: fakeNode(),
    dread: fakeNode(),
    timeText: fakeNode(),
  };
}

const HUD_NODES = [
  'hud',
  'intro',
  'end',
  'pause',
  'hiddenOverlay',
  'redveil',
  'banner',
  'floorText',
  'floorName',
  'dreadPct',
  'dreadBar',
  'timeText',
  'objective',
  'compass',
  'battBar',
  'stamBar',
  'ammo',
  'mementoCount',
  'reticle',
  'resistWrap',
  'resistBar',
  'resistNarr',
  'lifelineDots',
  'endTitle',
  'endSub',
  'endStats',
];

function fullEls() {
  const el = {};
  for (const name of HUD_NODES) el[name] = fakeNode();
  return el;
}

function baseState(overrides = {}) {
  return {
    phase: 'playing',
    floor: 2,
    floorName: 'The Stairwell',
    dread: 20,
    timeText: '04:30',
    timerColor: '#F1FAEE',
    objective: 'Find the phone',
    compassRot: 0,
    batt: 90,
    stam: 80,
    ammo: 6,
    mementos: 2,
    lifelines: 1,
    banner: '',
    temptation: 10,
    showResist: false,
    resistNarr: '',
    hiddenView: false,
    paused: false,
    ending: null,
    ...overrides,
  };
}

function snapshot(el) {
  const out = {};
  for (const name of Object.keys(el)) {
    const node = el[name];
    out[name] = {
      text: node.textContent,
      textWrites: node.writeCount,
      classCalls: node.classCalls.length,
      styleWrites: node.styleWrites.length,
      offsetReads: node.offsetReads,
    };
  }
  return out;
}

test('first render writes every field', () => {
  const el = fakeEls();
  const hud = createHud({ el });
  hud.render({ banner: 'HELLO', statLine: 'stats', dread: '42%', timeText: '04:59' });
  assert.equal(el.banner.textContent, 'HELLO');
  assert.equal(el.statLine.textContent, 'stats');
  assert.equal(el.dread.textContent, '42%');
  assert.equal(el.timeText.textContent, '04:59');
});

test('identical second render writes nothing', () => {
  const el = fakeEls();
  const hud = createHud({ el });
  const state = { banner: 'HELLO', statLine: 'stats', dread: '42%', timeText: '04:59' };
  hud.render(state);
  const classCallsBefore = el.banner.classCalls.length
    + el.statLine.classCalls.length
    + el.dread.classCalls.length
    + el.timeText.classCalls.length;
  hud.render({ ...state });
  assert.equal(el.banner.writeCount, 1);
  assert.equal(el.statLine.writeCount, 1);
  assert.equal(el.dread.writeCount, 1);
  assert.equal(el.timeText.writeCount, 1);
  assert.equal(
    el.banner.classCalls.length
      + el.statLine.classCalls.length
      + el.dread.classCalls.length
      + el.timeText.classCalls.length,
    classCallsBefore,
  );
});

test('changed banner rewrites only the banner node', () => {
  const el = fakeEls();
  const hud = createHud({ el });
  hud.render({ banner: 'ONE', statLine: 'stats', dread: '42%', timeText: '04:59' });
  hud.render({ banner: 'TWO', statLine: 'stats', dread: '42%', timeText: '04:59' });
  assert.equal(el.banner.textContent, 'TWO');
  assert.equal(el.banner.writeCount, 2);
  assert.equal(el.statLine.writeCount, 1);
  assert.equal(el.dread.writeCount, 1);
  assert.equal(el.timeText.writeCount, 1);
});

test('missing el nodes never throw', () => {
  assert.doesNotThrow(() => {
    createHud({ el: {} }).render({ banner: 'X', statLine: 'Y', dread: 'Z', timeText: 'T' });
  });
  assert.doesNotThrow(() => {
    createHud().render({ banner: 'X' });
  });
  assert.doesNotThrow(() => {
    createHud({ el: { banner: fakeNode() } }).render();
  });
  assert.doesNotThrow(() => {
    createHud({ el: { banner: fakeNode() } }).render(null);
  });
});

test('phase controls the hud, intro, pause, reticle, hidden overlay, and end screen', () => {
  const el = fullEls();
  const hud = createHud({ el });

  hud.render(baseState({ phase: 'intro' }));
  assert.equal(el.intro.classes.has('hidden'), false);
  assert.equal(el.hud.classes.has('hidden'), true);
  assert.equal(el.pause.classes.has('hidden'), true);
  assert.equal(el.end.classes.has('hidden'), true);
  assert.equal(el.end.style.display, 'none');
  assert.equal(el.reticle.style.display, 'none');

  hud.render(baseState({ phase: 'playing', paused: true }));
  assert.equal(el.hud.classes.has('hidden'), false);
  assert.equal(el.intro.classes.has('hidden'), true);
  assert.equal(el.pause.classes.has('hidden'), false);
  assert.equal(el.end.classes.has('hidden'), true);
  assert.equal(el.reticle.style.display, 'none');

  hud.render(baseState({ phase: 'playing', paused: false, hiddenView: true }));
  assert.equal(el.pause.classes.has('hidden'), true);
  assert.equal(el.hiddenOverlay.classes.has('hidden'), false);
  assert.equal(el.reticle.style.display, 'none');

  hud.render(baseState({ phase: 'playing', paused: false, hiddenView: false }));
  assert.equal(el.hiddenOverlay.classes.has('hidden'), true);
  assert.equal(el.reticle.style.display, 'block');

  hud.render(baseState({ phase: 'end' }));
  assert.equal(el.end.style.display, 'flex');
  assert.equal(el.end.classes.has('hidden'), false);
  assert.equal(el.hud.classes.has('hidden'), true);
  assert.equal(el.intro.classes.has('hidden'), true);
  assert.equal(el.reticle.style.display, 'none');
});

test('renders dread percent, dread bar width, and capped red veil', () => {
  const el = fullEls();
  const hud = createHud({ el });

  hud.render(baseState({ dread: 50 }));
  assert.equal(el.dreadPct.textContent, '50%');
  assert.equal(el.dreadBar.style.width, '50%');
  assert.equal(el.redveil.style.opacity, 0.34);

  hud.render(baseState({ dread: 100 }));
  assert.equal(el.dreadPct.textContent, '100%');
  assert.equal(el.dreadBar.style.width, '100%');
  assert.equal(el.redveil.style.opacity, 0.62);

  hud.render(baseState({ dread: 41.6 }));
  assert.equal(el.dreadPct.textContent, '42%');
  assert.equal(el.dreadBar.style.width, '42%');
});

test('renders floor number, floor name, timer, and objective', () => {
  const el = fullEls();
  const hud = createHud({ el });

  hud.render(baseState({
    floor: 3,
    floorName: 'The Stairwell',
    timeText: '04:59',
    timerColor: '#E63946',
    objective: 'Call the phone',
  }));
  assert.equal(el.floorText.textContent, '03');
  assert.equal(el.floorName.textContent, 'The Stairwell');
  assert.equal(el.timeText.textContent, '04:59');
  assert.equal(el.timeText.style.color, '#E63946');
  assert.equal(el.objective.textContent, 'Call the phone');

  hud.render(baseState({ floor: 12 }));
  assert.equal(el.floorText.textContent, '12');
});

test('renders compass, battery, stamina, and ammo', () => {
  const el = fullEls();
  const hud = createHud({ el });

  hud.render(baseState({ compassRot: 90, batt: 80, stam: 55.6, ammo: 3 }));
  assert.equal(el.compass.style.transform, 'rotate(90deg)');
  assert.equal(el.battBar.style.width, '80%');
  assert.equal(el.battBar.style.background, '#A8DADC');
  assert.equal(el.stamBar.style.width, '56%');
  assert.equal(el.ammo.textContent, '3');

  hud.render(baseState({ compassRot: -30, batt: 24 }));
  assert.equal(el.compass.style.transform, 'rotate(-30deg)');
  assert.equal(el.battBar.style.width, '24%');
  assert.equal(el.battBar.style.background, '#E63946');
});

test('renders memento count and lifeline hearts', () => {
  const el = fullEls();
  const hud = createHud({ el });

  hud.render(baseState({ mementos: 4, lifelines: 2 }));
  assert.equal(el.mementoCount.textContent, '4 / 6');
  assert.equal(el.lifelineDots.textContent, '♥♥♡♡');

  hud.render(baseState({ mementos: 6, lifelines: 6 }));
  assert.equal(el.mementoCount.textContent, '6 / 6');
  assert.equal(el.lifelineDots.textContent, '♥♥♥♥♥♥');

  hud.render(baseState({ mementos: 0, lifelines: 0 }));
  assert.equal(el.mementoCount.textContent, '0 / 6');
  assert.equal(el.lifelineDots.textContent, '');
});

test('renders resistance bar, visibility, and narration', () => {
  const el = fullEls();
  const hud = createHud({ el });

  hud.render(baseState({ showResist: true, temptation: 64.6, resistNarr: 'Hold on to the memory' }));
  assert.equal(el.resistWrap.classes.has('hidden'), false);
  assert.equal(el.resistBar.style.width, '65%');
  assert.equal(el.resistNarr.textContent, 'Hold on to the memory');

  hud.render(baseState({ showResist: false }));
  assert.equal(el.resistWrap.classes.has('hidden'), true);
});

test('renders ending title, subtitle, stats, and bad color', () => {
  const el = fullEls();
  const hud = createHud({ el });

  hud.render(baseState({
    phase: 'end',
    ending: { title: 'Rescued', sub: 'The line went quiet.', stats: 'Floors: 3', bad: false },
  }));
  assert.equal(el.endTitle.textContent, 'Rescued');
  assert.equal(el.endTitle.style.color, '#A8DADC');
  assert.equal(el.endSub.textContent, 'The line went quiet.');
  assert.equal(el.endStats.textContent, 'Floors: 3');

  hud.render(baseState({
    phase: 'end',
    ending: { title: 'Fell', sub: 'You jumped.', stats: '', bad: true },
  }));
  assert.equal(el.endTitle.textContent, 'Fell');
  assert.equal(el.endTitle.style.color, '#E63946');
  assert.equal(el.endSub.textContent, 'You jumped.');
  assert.equal(el.endStats.textContent, '');

  hud.render(baseState({
    phase: 'playing',
    ending: { title: 'Ignored', sub: 'Not shown.', stats: 'n/a', bad: true },
  }));
  assert.equal(el.endTitle.textContent, 'Fell');
  assert.equal(el.endTitle.style.color, '#E63946');
  assert.equal(el.endSub.textContent, 'You jumped.');
});

test('identical render touches no node', () => {
  const el = fullEls();
  const hud = createHud({ el });
  const state = baseState({ banner: 'HELLO', showResist: true, resistNarr: 'Hold on' });

  hud.render(state);
  const before = snapshot(el);
  hud.render({ ...state });
  assert.deepEqual(snapshot(el), before);
});

test('changing one field touches only that field', () => {
  const el = fullEls();
  const hud = createHud({ el });
  const state = baseState();

  hud.render(state);
  hud.render({ ...state, objective: 'Reach the rooftop' });

  assert.equal(el.objective.textContent, 'Reach the rooftop');
  assert.equal(el.objective.writeCount, 2);
  assert.equal(el.floorText.writeCount, 1);
  assert.equal(el.timeText.writeCount, 1);
  assert.equal(el.banner.offsetReads, 0);
});

test('empty to non-empty banner restarts the animation after forcing layout', () => {
  const el = fullEls();
  const hud = createHud({ el });

  hud.render(baseState({ banner: '' }));
  assert.equal(el.banner.classes.has('hidden'), true);
  assert.equal(el.banner.offsetReads, 0);

  const mark = el.banner.events.length;
  hud.render(baseState({ banner: 'THE TOWER SHIFTS' }));

  assert.equal(el.banner.textContent, 'THE TOWER SHIFTS');
  assert.equal(el.banner.classes.has('hidden'), false);
  assert.equal(el.banner.offsetReads, 1);

  const events = el.banner.events.slice(mark);
  const animationWrites = events.filter((e) => e[0] === 'style' && e[1] === 'animation');
  assert.deepEqual(
    animationWrites.map((e) => e[2]),
    ['none', 'bannerIn 2.4s ease forwards'],
  );
  const firstAnimation = events.findIndex((e) => e[0] === 'style' && e[1] === 'animation');
  const layoutRead = events.findIndex((e) => e[0] === 'offsetWidth');
  assert.ok(firstAnimation >= 0);
  assert.ok(layoutRead > firstAnimation, 'offsetWidth is read after resetting the animation');
  assert.ok(
    events.slice(layoutRead + 1).some(
      (e) => e[0] === 'style' && e[1] === 'animation' && e[2] === 'bannerIn 2.4s ease forwards',
    ),
    'the restart animation is set after forcing layout',
  );
});

test('a changed non-empty banner restarts the animation again', () => {
  const el = fullEls();
  const hud = createHud({ el });

  hud.render(baseState({ banner: 'ONE' }));
  hud.render(baseState({ banner: 'TWO' }));

  assert.equal(el.banner.textContent, 'TWO');
  assert.equal(el.banner.offsetReads, 2);
  assert.equal(el.banner.style.animation, 'bannerIn 2.4s ease forwards');
});

test('empty banner hides without restarting the animation', () => {
  const el = fullEls();
  const hud = createHud({ el });

  hud.render(baseState({ banner: 'ONE' }));
  const mark = el.banner.events.length;
  hud.render(baseState({ banner: '' }));

  assert.equal(el.banner.classes.has('hidden'), true);
  assert.equal(el.banner.offsetReads, 1);

  const events = el.banner.events.slice(mark);
  assert.ok(events.some((e) => e[0] === 'add' && e[1] === 'hidden'));
  assert.ok(!events.some((e) => e[0] === 'text'));
  assert.ok(!events.some((e) => e[0] === 'style' && e[1] === 'animation'));
  assert.ok(!events.some((e) => e[0] === 'offsetWidth'));

  const stableMark = el.banner.events.length;
  hud.render(baseState({ banner: '' }));
  assert.equal(el.banner.events.length, stableMark);
});

test('partial element maps still render the nodes that exist', () => {
  const el = { endTitle: fakeNode(), banner: fakeNode() };
  const hud = createHud({ el });

  assert.doesNotThrow(() => {
    hud.render(baseState({
      phase: 'end',
      banner: 'DONE',
      ending: { title: 'Rescued', sub: 'Safe.', stats: 'Floors: 6', bad: false },
    }));
  });
  assert.equal(el.endTitle.textContent, 'Rescued');
  assert.equal(el.banner.textContent, 'DONE');

  assert.doesNotThrow(() => createHud({ el: {} }).render(baseState()));
  assert.doesNotThrow(() => createHud({}).render(baseState({ banner: 'Y' })));
  assert.doesNotThrow(() => createHud({ el: { hud: fakeNode() } }).render());
  assert.doesNotThrow(() => createHud({ el: { hud: fakeNode() } }).render(null));
});

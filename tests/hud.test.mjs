import assert from 'node:assert/strict';
import test from 'node:test';
import { createHud } from '../public/hud.mjs';

function fakeNode() {
  let value = null;
  let writes = 0;
  const classCalls = [];
  const node = {
    get textContent() {
      return value;
    },
    set textContent(v) {
      writes += 1;
      value = v;
    },
    get writeCount() {
      return writes;
    },
    get classCalls() {
      return classCalls;
    },
    classList: {
      add(...args) {
        classCalls.push(['add', ...args]);
      },
      remove(...args) {
        classCalls.push(['remove', ...args]);
      },
      toggle(...args) {
        classCalls.push(['toggle', ...args]);
      },
    },
    style: {},
  };
  return node;
}

function fakeEls() {
  return {
    banner: fakeNode(),
    statLine: fakeNode(),
    dread: fakeNode(),
    timeText: fakeNode(),
  };
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

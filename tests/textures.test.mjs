// Guards the procedural surface detail module: shape, neutral tone, determinism and tiling.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  TEXTURE_KINDS,
  bumpField,
  createTextureSet,
  detailField,
} from '../public/textures.mjs';

const KINDS = [...TEXTURE_KINDS];
const SIZE = 256;

function channel(field, x, y) {
  return field.data[(y * field.width + x) * 4];
}

function column(field, x) {
  const values = new Float64Array(field.height);
  for (let y = 0; y < field.height; y++) values[y] = channel(field, x, y);
  return values;
}

function row(field, y) {
  const values = new Float64Array(field.width);
  for (let x = 0; x < field.width; x++) values[x] = channel(field, x, y);
  return values;
}

function mean(values) {
  let total = 0;
  for (let i = 0; i < values.length; i++) total += values[i];
  return total / values.length;
}

function meanAbsDiff(left, right) {
  let total = 0;
  for (let i = 0; i < left.length; i++) total += Math.abs(left[i] - right[i]);
  return total / left.length;
}

function levels(field) {
  const values = new Float64Array(field.width * field.height);
  for (let i = 0; i < values.length; i++) values[i] = field.data[i * 4];
  return values;
}

function percentile(field, fraction) {
  const sorted = levels(field).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

test('every kind yields a full RGBA detail field from a browser-free module', async () => {
  const source = await readFile(new URL('../public/textures.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /^\s*import\b|\bimport\s*\(|\bfrom\s*['"]/m,
    'textures.mjs must not import runtime dependencies',
  );
  assert.doesNotMatch(
    source,
    /\b(?:window|document|HTMLElement|THREE|fetch|XMLHttpRequest|localStorage|sessionStorage)\b/,
    'textures.mjs must stay free of browser, renderer, network and storage APIs',
  );
  assert.doesNotMatch(source, /Math\.random/, 'procedural detail must be seeded, never random');

  for (const kind of KINDS) {
    const field = detailField({ kind, size: SIZE, seed: 7 });
    assert.equal(field.width, SIZE, `${kind} width`);
    assert.equal(field.height, SIZE, `${kind} height`);
    assert.equal(field.data.length, SIZE * SIZE * 4, `${kind} data length`);

    let opaque = true;
    for (let i = 3; i < field.data.length; i += 4) {
      if (field.data[i] !== 255) {
        opaque = false;
        break;
      }
    }
    assert.ok(opaque, `${kind} detail alpha must be fully opaque`);
  }
});

test('detail luminance stays neutral and mid-bright for every kind', () => {
  for (const kind of KINDS) {
    const field = detailField({ kind, size: SIZE, seed: 11 });
    const average = mean(levels(field));
    assert.ok(
      average > 0.6 * 255 && average < 0.98 * 255,
      `${kind} mean luminance ${average.toFixed(1)} is outside the neutral band`,
    );

    const low = percentile(field, 0.01);
    const high = percentile(field, 0.99);
    assert.ok(low > 96, `${kind} p1 ${low} is too close to black`);
    assert.ok(high < 252, `${kind} p99 ${high} is too close to white`);
    assert.ok(high - low > 14, `${kind} detail is flat: p1 ${low} .. p99 ${high}`);
  }
});

test('bump fields centre on mid-gray and pair with their detail field', () => {
  for (const kind of KINDS) {
    const bump = bumpField({ kind, size: SIZE, seed: 3 });
    const average = mean(levels(bump));
    assert.ok(average > 100 && average < 156, `${kind} bump mean ${average.toFixed(1)} is not mid-gray`);
    assert.equal(bump.data.length, SIZE * SIZE * 4);

    const set = createTextureSet({ kind, size: 64, seed: 3 });
    assert.deepEqual(set.detail, detailField({ kind, size: 64, seed: 3 }), `${kind} set detail`);
    assert.deepEqual(set.bump, bumpField({ kind, size: 64, seed: 3 }), `${kind} set bump`);
    assert.equal(set.detail.width, 64);
    assert.equal(set.bump.height, 64);
    assert.equal(set.detail.data.length, 64 * 64 * 4);
  }
});

test('output is deterministic per seed and changes across seeds', () => {
  for (const kind of KINDS) {
    const first = detailField({ kind, size: 64, seed: 42 });
    const again = detailField({ kind, size: 64, seed: 42 });
    assert.deepEqual(first.data, again.data, `${kind} is not byte-identical for the same seed`);
    assert.deepEqual(
      bumpField({ kind, size: 64, seed: 42 }).data,
      bumpField({ kind, size: 64, seed: 42 }).data,
      `${kind} bump is not byte-identical for the same seed`,
    );

    const other = detailField({ kind, size: 64, seed: 43 });
    assert.notDeepEqual(first.data, other.data, `${kind} ignores the seed`);
  }
});

test('detail fields tile seamlessly on both axes', () => {
  for (const kind of KINDS) {
    const field = detailField({ kind, size: SIZE, seed: 5 });
    const wrapColumns = meanAbsDiff(column(field, 0), column(field, SIZE - 1));
    const wrapRows = meanAbsDiff(row(field, 0), row(field, SIZE - 1));
    const apartColumns = Math.max(
      meanAbsDiff(column(field, 40), column(field, 184)),
      meanAbsDiff(column(field, 88), column(field, 232)),
    );
    const apartRows = Math.max(
      meanAbsDiff(row(field, 40), row(field, 184)),
      meanAbsDiff(row(field, 88), row(field, 232)),
    );

    assert.ok(wrapColumns < 24, `${kind} column seam differs by ${wrapColumns.toFixed(1)}`);
    assert.ok(wrapRows < 24, `${kind} row seam differs by ${wrapRows.toFixed(1)}`);
    assert.ok(
      wrapColumns < apartColumns,
      `${kind} column seam ${wrapColumns.toFixed(1)} is not tighter than interior spacing ${apartColumns.toFixed(1)}`,
    );
    assert.ok(
      wrapRows < apartRows,
      `${kind} row seam ${wrapRows.toFixed(1)} is not tighter than interior spacing ${apartRows.toFixed(1)}`,
    );
  }
});

test('unknown kinds and out-of-range sizes are rejected', () => {
  for (const kind of ['stone', 'plastery', '', undefined, null]) {
    assert.throws(() => detailField({ kind }), RangeError, `detailField accepts ${String(kind)}`);
    assert.throws(() => bumpField({ kind }), RangeError, `bumpField accepts ${String(kind)}`);
    assert.throws(() => createTextureSet({ kind }), RangeError, `createTextureSet accepts ${String(kind)}`);
  }

  for (const size of [16, 2048, 31, 1025, 0, -64]) {
    for (const kind of KINDS) {
      assert.throws(() => detailField({ kind, size }), RangeError, `detailField accepts size ${size}`);
      assert.throws(() => bumpField({ kind, size }), RangeError, `bumpField accepts size ${size}`);
    }
  }
});

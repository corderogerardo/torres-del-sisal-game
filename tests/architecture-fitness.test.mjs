import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { RuntimeMetrics } from '../public/runtime-metrics.mjs';

const rulesSource = await readFile(new URL('../public/game-rules.mjs', import.meta.url), 'utf8');
const metricsSource = await readFile(new URL('../public/runtime-metrics.mjs', import.meta.url), 'utf8');
const pageSource = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

function assertPureBrowserIndependent(source, moduleName) {
  assert.doesNotMatch(
    source,
    /^\s*import\b|\bimport\s*\(|\bfrom\s*['"]/m,
    `${moduleName} must not import runtime dependencies`,
  );
  assert.doesNotMatch(
    source,
    /\b(?:window|document|HTMLElement|THREE|WebGLRenderer|localStorage|sessionStorage|fetch|XMLHttpRequest|sendBeacon)\b/,
    `${moduleName} must not depend on browser, renderer, network, or storage APIs`,
  );
}

test('game rules and metrics remain pure browser-independent modules', () => {
  assertPureBrowserIndependent(rulesSource, 'game-rules.mjs');
  assertPureBrowserIndependent(metricsSource, 'runtime-metrics.mjs');
});

test('game opts into local metrics only through the metrics query parameter', () => {
  assert.match(pageSource, /\.has\(['"]metrics['"]\)/);
  assert.match(pageSource, /new RuntimeMetrics\(/);
  assert.match(pageSource, /renderer\.info/);
});

test('runtime metrics retain a bounded rolling sample and report percentiles and renderer counts', () => {
  const metrics = new RuntimeMetrics(3);
  const info = (calls, geometries, textures) => ({
    render: { calls },
    memory: { geometries, textures },
  });

  metrics.record(10, info(4, 12, 3));
  metrics.record(20, info(5, 13, 4));
  metrics.record(30, info(6, 14, 5));
  metrics.record(40, info(7, 15, 6));

  assert.deepEqual(metrics.snapshot(), {
    samples: 3,
    fps: 33.3,
    frameTimeMs: { p50: 30, p95: 40, p99: 40 },
    drawCalls: 7,
    geometries: 15,
    textures: 6,
  });
});

test('runtime metrics ignore invalid frame durations', () => {
  const metrics = new RuntimeMetrics(2);
  metrics.record(16, { render: { calls: 2 }, memory: { geometries: 3, textures: 1 } });
  metrics.record(0, { render: { calls: 9 }, memory: { geometries: 9, textures: 9 } });
  metrics.record(Number.NaN, { render: { calls: 9 }, memory: { geometries: 9, textures: 9 } });

  assert.deepEqual(metrics.snapshot(), {
    samples: 1,
    fps: 62.5,
    frameTimeMs: { p50: 16, p95: 16, p99: 16 },
    drawCalls: 2,
    geometries: 3,
    textures: 1,
  });
});

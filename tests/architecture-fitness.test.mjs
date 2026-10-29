import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { RuntimeMetrics } from '../public/runtime-metrics.mjs';

const rulesSource = await readFile(new URL('../public/game-rules.mjs', import.meta.url), 'utf8');
const metricsSource = await readFile(new URL('../public/runtime-metrics.mjs', import.meta.url), 'utf8');
const hudSource = await readFile(new URL('../public/hud.mjs', import.meta.url), 'utf8');
const loopSource = await readFile(new URL('../public/engine-loop.mjs', import.meta.url), 'utf8');
const runStateSource = await readFile(new URL('../public/run-state.mjs', import.meta.url), 'utf8');
const gameSource = await readFile(new URL('../public/game.mjs', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../public/main.mjs', import.meta.url), 'utf8');
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

test('engine seams remain pure and the wired ones are imported', () => {
  assertPureBrowserIndependent(hudSource, 'hud.mjs');
  assertPureBrowserIndependent(loopSource, 'engine-loop.mjs');
  assertPureBrowserIndependent(runStateSource, 'run-state.mjs');
  assert.match(gameSource, /from '\.\/hud\.mjs'/, 'Game must import the HUD seam');
  assert.match(gameSource, /this\.hud\.render\(/, 'Game must render through the HUD seam');
  assert.match(gameSource, /from '\.\/engine-loop\.mjs'/, 'Game must import the loop seam');
  assert.match(gameSource, /this\._loop\.start\(\)/, 'Game must start the injected loop');
  assert.match(gameSource, /from '\.\/run-state\.mjs'/, 'Game must import the run-state seam');
  assert.match(gameSource, /this\._stepRun\(/, 'Game must advance survival rules through the run-state seam');
});

test('game opts into local metrics only through the metrics query parameter', () => {
  assert.match(gameSource, /\.has\(['"]metrics['"]\)/);
  assert.match(gameSource, /new RuntimeMetrics\(/);
  assert.match(gameSource, /renderer\.info/);
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

test('audio seam is wired behind play(kind)', () => {
  assert.match(gameSource, /from '\.\/audio\.mjs'/);
  assert.match(gameSource, /createAudioEngine/);
  assert.match(gameSource, /this\.audio\.play\(kind/);
  assert.match(gameSource, /play\(kind/);
  assert.match(gameSource, /this\.play\('chime'\)/);
  assert.match(gameSource, /this\.play\('vanish'\)/);
});

test('Game dispatches spawn codes through the bestiary module', () => {
  assert.match(gameSource, /import\s*\{[^}]*createBestiaryMeshFactory[^}]*\}\s*from '\.\/bestiary\.mjs'/,
    'Game must import the injected bestiary mesh adapter');
  assert.match(gameSource, /this\.bestiary=createBestiary\(/,
    'Game must construct its bestiary module');
  assert.match(gameSource, /SPAWN_FACTORY=\{s:'sombra',d:'duende',y:'sayona',l:'llorona',b:'silbon',m:'manguanguas'\}/,
    'spawn plan codes must map to all six bestiary kinds');
  assert.match(gameSource, /RESPAWN_FACTORY=\{sayona:'sayona',silbon:'silbon',duende:'duende',manguanguas:'manguanguas'\}/,
    'respawn kinds must keep their existing factory mapping');
  assert.match(gameSource, /4:\['l','m','d'\]/,
    'floor 4 must introduce Manguanguas in place of one Sombra');
  assert.match(gameSource, /this\.bestiary\.spawn\(SPAWN_FACTORY\[t\]\|\|'silbon'/,
    'spawn must use the bestiary and preserve the Silbon fallback');
  assert.match(gameSource, /this\.bestiary\.spawn\(RESPAWN_FACTORY\[t\]\|\|'sombra'/,
    'respawn must use the bestiary and preserve the Sombra fallback');
  assert.doesNotMatch(gameSource, /this\._make(?:Sombra|Sayona|Llorona|Silbon|Duende)\s*\(/,
    'enemy mesh factories must no longer live on Game');
});

test('Game delegates entity behavior and lifecycle without kind-specific branches', () => {
  assert.match(gameSource, /this\.bestiary\.tick\(/, 'Game must delegate entity AI updates');
  assert.match(gameSource, /this\.bestiary\.animate\(/, 'Game must delegate entity animation');
  assert.match(gameSource, /this\.bestiary\.remove\(/, 'removed entities must leave the bestiary registry');
  assert.match(gameSource, /this\.bestiary\.clear\(/, 'floor resets must clear the bestiary registry');
  assert.match(gameSource, /this\._respawnQ\.push\(best\.kind\)/,
    'respawn queues must use the entity kind tag');
  assert.doesNotMatch(gameSource, /(?:e|entity)\.(?:type|kind)\s*===?\s*['"](?:sombra|sayona|llorona|silbon|duende)['"]/,
    'Game must not branch on enemy kind');
  assert.doesNotMatch(gameSource, /switch\s*\(\s*(?:e|entity)\.(?:type|kind)\s*\)/,
    'Game must not switch on enemy kind');
  assert.match(gameSource, /entityCatch\(e\)\s*\{[^}]*e\.catchMessage/s,
    'catch messaging must come from the bestiary entity');
});

test('Game synchronizes its entity list with bestiary lifecycle', () => {
  assert.match(gameSource, /this\.entities\.push\(this\.bestiary\.spawn\(SPAWN_FACTORY\[t\]\|\|'silbon',x,z\)\)/);
  assert.match(gameSource, /this\.bestiary\.remove\(best\);\s*this\.entities=this\.entities\.filter\(x=>x!==best\)/);
  assert.match(gameSource, /this\.bestiary\.clear\(\);\s*this\.entities=\[\];\s*this\._spawnEntities\(n,rng\)/);
  assert.match(gameSource, /this\.bestiary\.spawn\(RESPAWN_FACTORY\[t\]\|\|'sombra',x,z\);[\s\S]*?this\.entities\.push\(e\)/);
});

test('spot checks delegate to the level module', () => {
  assert.match(gameSource, /from '\.\/level\.mjs'/);
  assert.match(gameSource, /return spotBlocked\(x, z, \{ boxes: this\.colliders/);
  assert.match(gameSource, /this\.level\.resolve\(p,r\)/);
  assert.match(gameSource, /findFreeSpot\(\{/);
  assert.match(gameSource, /disposeGroup\(g\)/);
  assert.match(gameSource, /this\.level\?\.pickupAt\(cam\.position\)/);
  assert.match(gameSource, /createLevel\(\{ layout: \{ kind: 'room', colliders: this\.colliders, pickups \} \}\)/);
});

test('index.html is a shell that boots the composition root', () => {
  assert.match(pageSource, /window\.TDS_BUILD = 'v4'/);
  assert.match(pageSource, /<script type="module"[^>]*src="\.\/main\.mjs"/);
  assert.doesNotMatch(pageSource, /class Game\{/);
  assert.match(mainSource, /import \{ Game, showFatal \} from '\.\/game\.mjs'/);
  assert.match(mainSource, /window\._game = new Game\(\)/);
  assert.match(gameSource, /export \{ Game, showFatal \}/);
});

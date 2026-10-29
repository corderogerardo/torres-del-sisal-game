import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const game = await readFile(new URL('../public/game.mjs', import.meta.url), 'utf8');

function methodSource(name, nextName) {
  const candidates = [game.indexOf(`  ${name}(`), game.indexOf(`  async ${name}(`)].filter((index) => index >= 0);
  const start = candidates.length ? Math.min(...candidates) : -1;
  const end = game.indexOf(`\n  ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `could not locate Game.${name}()`);
  return game.slice(start, end);
}

function assertPageMatches(pattern, description) {
  assert.ok(pattern.test(html), description);
}

test('run telemetry is automatic by default with a visible opt-out and no player identity', () => {
  assertPageMatches(/<input[^>]*type="checkbox"[^>]*id="runTelemetryOptOut"/, 'telemetry opt-out checkbox is required');
  assertPageMatches(/<label[^>]*for="runTelemetryOptOut"/, 'telemetry opt-out needs a label');
  assert.doesNotMatch(html.match(/<input[^>]*id="runTelemetryOptOut"[^>]*>/)?.[0] || '', /\bchecked\b/);
  assertPageMatches(/se registran automáticamente estadísticas agregadas/i, 'notice must disclose default-on aggregate collection');
  assertPageMatches(/nombre de usuario ni un identificador de jugador/i, 'notice must state that run data is not player-linked');
  assertPageMatches(/identificador aleatorio solo para evitar duplicados/i, 'notice must explain the run-scoped idempotency identifier');
  assertPageMatches(/no se muestra el historial individual/i, 'notice must explain that individual histories are not exposed');
  assert.match(methodSource('_updateRunTelemetryPreferences', '_renderRunRecords'), /setRunTelemetryEnabled\(enabled\)/);
  assert.match(methodSource('_updateRunTelemetryPreferences', '_renderRunRecords'), /clearPendingRuns\(\)/);
});

test('privacy notice distinguishes game-owned fields from provider connection metadata', () => {
  assertPageMatches(/Las tablas(?: de telemetría)? del juego no guardan direcciones IP/i, 'notice must state that game tables do not store IP fields');
  assertPageMatches(/Supabase puede procesar la dirección IP y el agente de usuario/i, 'notice must disclose provider-side connection metadata');
  assertPageMatches(/retención depende de la configuración y el plan del proyecto/i, 'notice must point to project-dependent log retention');
  assertPageMatches(/Las cifras cuentan partidas, no personas únicas/i, 'notice must not claim unique people');
  assertPageMatches(/no se verifican contra trampas/i, 'notice must label scores as unverified');
  assertPageMatches(/no hay borrado individual desde el juego/i, 'notice must disclose that runs cannot be deleted individually');
});

test('aggregate rendering uses text nodes and exposes no player-controlled fields', () => {
  const render = methodSource('_renderRunRecords', '_formatRunDuration');
  assert.match(render, /textContent/);
  assert.doesNotMatch(render, /innerHTML/);
  assert.match(render, /averageDurationMs/);
  assert.match(render, /p50DurationMs/);
  assert.match(render, /p95DurationMs/);
});

test('only rescued and jumped endings submit terminal outcomes', () => {
  const forcedAscension = methodSource('ascendForced', 'jumpEnding');
  const jumped = methodSource('jumpEnding', 'rescuedEnding');
  const rescued = methodSource('rescuedEnding', '_statLine');
  assert.doesNotMatch(forcedAscension, /_recordTerminalRun/);
  assert.match(jumped, /_recordTerminalRun\('jumped'\)/);
  assert.match(rescued, /_recordTerminalRun\('rescued'\)/);
});

test('run recording starts and ends without awaiting network work in gameplay transitions', () => {
  const start = methodSource('_start', '_noise');
  const terminal = methodSource('_recordTerminalRun', '_noise');
  assert.match(start, /this\._runSession\.start/);
  assert.match(start, /this\._runRecords\.startRun/);
  assert.doesNotMatch(start, /await\s+this\._runRecords\.startRun/);
  assert.match(terminal, /this\._runSession\.finish/);
  assert.match(terminal, /this\._runRecords\.finishRun/);
  assert.doesNotMatch(terminal, /await\s+this\._runRecords\.finishRun/);
});

test('startup replays queued telemetry only after the intro notice can paint', () => {
  const constructor = methodSource('constructor', 'setState');
  const sync = constructor.indexOf('this._sync()');
  const firstFrame = constructor.indexOf('requestAnimationFrame');
  const secondFrame = constructor.indexOf('requestAnimationFrame', firstFrame + 1);
  assert.ok(sync >= 0 && firstFrame > sync, 'paint scheduling must follow the initial intro render');
  assert.ok(secondFrame > firstFrame, 'a second frame must follow the notice paint before network replay');
  assert.match(constructor.slice(firstFrame), /requestAnimationFrame\(\(\)=>\{[\s\S]*requestAnimationFrame\(\(\)=>\{[\s\S]*flushPendingRuns/);
  assert.match(constructor.slice(firstFrame, secondFrame), /_runTelemetryEnabled/);
});

test('end screen announces non-blocking record success or failure', () => {
  assertPageMatches(/id="endRunRecordStatus"[^>]*role="status"[^>]*aria-live="polite"/, 'end screen needs a polite record-status region');
  const terminal = methodSource('_recordTerminalRun', '_statLine');
  assert.match(terminal, /endRunRecordStatus/);
  assert.match(terminal, /\.then\(/);
  assert.doesNotMatch(terminal, /await\s+this\._runRecords\.finishRun/);
  assert.match(terminal, /Partida guardada en este dispositivo/);
});

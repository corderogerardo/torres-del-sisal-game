import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

function methodSource(name, nextName) {
  const start = page.indexOf(`  ${name}(`);
  const end = page.indexOf(`\n  ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `could not locate Game.${name}()`);
  return page.slice(start, end);
}

function assertPageMatches(pattern, description) {
  assert.ok(pattern.test(page), description);
}

test('statistics and publication choices are separate, labelled, and off by default', () => {
  assertPageMatches(/<input[^>]*type="checkbox"[^>]*id="statsOptIn"/, 'anonymous statistics opt-in checkbox is required');
  assertPageMatches(/<input[^>]*type="checkbox"[^>]*id="rescueOptIn"/, 'public rescue opt-in checkbox is required');
  assertPageMatches(/<label[^>]*for="statsOptIn"/, 'statistics checkbox needs a label');
  assertPageMatches(/<label[^>]*for="rescueOptIn"/, 'publication checkbox needs a label');
  assertPageMatches(/<input[^>]*id="displayAlias"[^>]*maxlength="24"/, 'alias input must be bounded');
  assert.doesNotMatch(page.match(/<input[^>]*id="statsOptIn"[^>]*>/)?.[0] || '', /\bchecked\b/);
  assert.doesNotMatch(page.match(/<input[^>]*id="rescueOptIn"[^>]*>/)?.[0] || '', /\bchecked\b/);
});

test('privacy notice distinguishes game-owned fields from provider connection metadata', () => {
  assertPageMatches(/Las tablas del juego no guardan direcciones IP/i, 'notice must state that game tables do not store IP fields');
  assertPageMatches(/Supabase puede procesar la dirección IP y el agente de usuario/i, 'notice must disclose provider-side connection metadata');
  assertPageMatches(/retención depende de la configuración y el plan del proyecto/i, 'notice must point to project-dependent log retention');
  assertPageMatches(/no se verifican contra trampas/i, 'notice must label scores as unverified');
  assertPageMatches(/sesiones anónimas, no personas/i, 'notice must not claim unique people');
  assertPageMatches(/borrar.*antes de cerrar esta sesión/i, 'notice must disclose the live-session deletion limit');
  assertPageMatches(/no podrás recuperar ese historial/i, 'notice must disclose that anonymous history is not recoverable later');
});

test('dynamic leaderboard rendering uses text nodes, not user-controlled HTML', () => {
  const render = methodSource('_renderRunRecords', '_formatRunDuration');
  assert.match(render, /textContent/);
  assert.match(render, /replaceChildren/);
  assert.doesNotMatch(render, /innerHTML/);
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

test('end screen announces non-blocking record success or failure', () => {
  assertPageMatches(/id="endRunRecordStatus"[^>]*role="status"[^>]*aria-live="polite"/, 'end screen needs a polite record-status region');
  const terminal = methodSource('_recordTerminalRun', '_statLine');
  assert.match(terminal, /endRunRecordStatus/);
  assert.match(terminal, /\.then\(/);
  assert.doesNotMatch(terminal, /await\s+this\._runRecords\.finishRun/);
});

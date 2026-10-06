import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const intro = page.match(/<div id="intro"[\s\S]*?<\/div>\s*<!-- ============ End ============ -->/)?.[0];
const panel = intro?.match(/<section id="supportNote"[\s\S]*?<\/section>/)?.[0];

test('intro shows an accessible support and content note before game entry', () => {
  assert.ok(panel, 'intro contains the support note section');
  assert.match(panel, /tabindex="0"/, 'support content can receive keyboard focus');
  assert.match(page, /\.support-note:focus-visible\s*\{/, 'keyboard focus remains visible');
  assert.match(panel, /aria-labelledby="supportNoteTitle"/);
  assert.match(panel, /id="supportNoteTitle"/);
  assert.match(panel, /suicidio/i);
  assert.match(panel, /puedes detenerte o salir cuando quieras/i);
  assert.match(panel, /persona de confianza/i);
  assert.match(panel, /centro de salud más cercano/i);
  assert.match(panel, /servicio de emergencias local/i);
  assert.ok(intro.indexOf(panel) < intro.indexOf('id="enterBtn"'), 'note appears before the start button');
  assert.doesNotMatch(panel, /(?:tel:|\+?\d[\d\s().-]{6,})/i, 'no unverified phone number is shown');
});

test('support content does not add tracking or player-data persistence', () => {
  assert.doesNotMatch(panel ?? '', /<\/?(?:form|input|iframe)\b|data-(?:analytics|track)/i);
  assert.doesNotMatch(page, /\b(?:sendBeacon|localStorage|sessionStorage|XMLHttpRequest)\b|\bfetch\s*\(/i);
});

// The legacy aggregate RPC reads the historical owner-scoped tables and is
// superseded by the identity-free telemetry reads. Retiring it must not reopen
// a browser-reachable path.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = new URL('../supabase/migrations/', import.meta.url);
const RETIREMENT = '202611030001_retire_legacy_run_analytics.sql';

const retirement = await readFile(new URL(RETIREMENT, MIGRATIONS), 'utf8');

test('legacy analytics RPC is revoked before it is dropped', () => {
  const revoke = retirement.search(
    /revoke all on function public\.get_run_analytics\(\) from public, anon, authenticated/i,
  );
  const drop = retirement.search(/drop function if exists public\.get_run_analytics\(\)/i);

  assert.notEqual(revoke, -1, 'retirement must revoke the legacy aggregate RPC from browser roles');
  assert.notEqual(drop, -1, 'retirement must drop the legacy aggregate RPC');
  assert.ok(revoke < drop, 'revoke must precede drop so the endpoint is closed even if the drop fails');
});

test('the retirement migration does not re-grant the legacy RPC', () => {
  assert.doesNotMatch(
    retirement,
    /grant execute on function public\.get_run_analytics/i,
    'retirement must not grant execute on the legacy aggregate RPC',
  );
});

test('no later migration re-grants the legacy RPC', async () => {
  const files = (await readdir(MIGRATIONS)).filter((name) => name.endsWith('.sql')).sort();
  const position = files.indexOf(RETIREMENT);

  assert.notEqual(position, -1, `${RETIREMENT} must exist`);

  for (const file of files.slice(position + 1)) {
    const sql = await readFile(new URL(file, MIGRATIONS), 'utf8');
    assert.doesNotMatch(
      sql,
      /grant execute on function public\.get_run_analytics/i,
      `${file} re-grants execute on the retired legacy RPC`,
    );
  }
});

test('no later migration recreates the retired RPC without revoking execute again', async () => {
  const files = (await readdir(MIGRATIONS)).filter((name) => name.endsWith('.sql')).sort();
  const position = files.indexOf(RETIREMENT);

  assert.notEqual(position, -1, `${RETIREMENT} must exist`);

  for (const file of files.slice(position + 1)) {
    const sql = await readFile(new URL(file, MIGRATIONS), 'utf8');
    if (!/create\s+(?:or\s+replace\s+)?function\s+public\.get_run_analytics\s*\(/i.test(sql)) continue;

    // CREATE FUNCTION grants EXECUTE to PUBLIC by default, so recreation alone reopens the endpoint.
    assert.match(
      sql,
      /revoke all on function public\.get_run_analytics\(\) from public, anon, authenticated/i,
      `${file} recreates the retired RPC without revoking execute from browser roles`,
    );
  }
});

test('the retirement migration removes only the callable surface', () => {
  assert.doesNotMatch(retirement, /\b(?:drop\s+table|truncate|delete\s+from)\b/i);
});

test('no shipped browser module calls the retired RPC', async () => {
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

  for (const entry of await readdir(publicDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
    const source = await readFile(path.join(publicDir, entry.name), 'utf8');
    assert.doesNotMatch(source, /get_run_analytics/, `public/${entry.name} calls the retired legacy RPC`);
  }
});

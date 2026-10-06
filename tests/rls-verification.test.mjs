import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// Behavioral proof that the database denies what the client assumes it denies.
//
// The other run-record tests assert against mocked clients and regex matches on
// migration text. They prove the JavaScript and the SQL file *look* right. They
// cannot prove that Postgres refuses a cross-user read, because they never open
// a connection. This file talks to a real project over raw HTTP so the database
// itself is the thing under test. Going through PostgREST and GoTrue directly,
// instead of the SDK, keeps the SDK out of the trust boundary: the claim being
// tested is "the database denies this", not "our wrapper denies this".
//
// Configure with SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, or with
// public/supabase-config.js. Without configuration these tests skip loudly
// rather than passing silently.
//
// Prefer a local project (`supabase start`) or a dedicated throwaway project.
// This suite creates and removes real rows.

const SKIP_REASON =
  'No Supabase credentials. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, or '
  + 'create public/supabase-config.js. Skipped: unverified is not verified.';

async function loadConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (url && key) return { url: url.replace(/\/+$/, ''), key };

  try {
    const local = (await import('../public/supabase-config.js')).default;
    if (local?.url && local?.publishableKey) {
      return { url: String(local.url).replace(/\/+$/, ''), key: String(local.publishableKey).trim() };
    }
  } catch {
    // No local config file. Not an error; the suite skips.
  }

  return null;
}

const config = await loadConfig();
const skip = config ? false : SKIP_REASON;

const SECRET_PATTERN = /sb_secret_|"role"\s*:\s*"service_role"|SUPABASE_SERVICE_ROLE|SUPABASE_DB_PASSWORD|postgres(?:ql)?:\/\/[^\s]*:[^\s@]*@/i;

test('the local Supabase config holds no secret credential', async () => {
  // This runs with no credentials configured, on purpose. It is the earliest
  // possible check on the one file a developer is tempted to paste a key into.
  // deploy.sh and deploy.yml repeat it before publishing, because this test only
  // runs when someone remembers to run it.
  const source = await readFile(new URL('../public/supabase-config.js', import.meta.url), 'utf8')
    .catch(() => null);

  if (source === null) {
    assert.equal(
      config === null,
      true,
      'credentials must come from either the config file or the environment, not both',
    );
    return;
  }

  assert.doesNotMatch(
    source,
    SECRET_PATTERN,
    'public/supabase-config.js must never hold a service-role key or database password; '
      + 'it is deployed to a public URL',
  );
});

async function signInAnonymously({ url, key }) {
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: '{}',
  });

  if (!response.ok) {
    throw new Error(
      `anonymous sign-in returned ${response.status}. Enable anonymous sign-ins `
      + '(dashboard -> Authentication -> Providers) before running this suite.',
    );
  }

  const payload = await response.json();
  if (!payload?.access_token || !payload?.user?.id) {
    throw new Error('anonymous sign-in returned no access token');
  }

  return { token: payload.access_token, userId: payload.user.id };
}

async function postgrest(path, session, { method = 'GET', body } = {}) {
  const headers = { apikey: session.key, Authorization: `Bearer ${session.token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${session.url}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { ok: response.ok, status: response.status, data };
}

// Rows only ever reach the caller in the response body. A denied read may surface
// as a permission error or as an empty result depending on grant versus policy,
// so every assertion below tests "no rows came back", never a specific status.
const rowsOf = (result) => (Array.isArray(result.data) ? result.data : []);

async function countRows(path, session, filters = {}) {
  const query = new URLSearchParams(
    Object.entries(filters).map(([column, value]) => [column, `eq.${value}`]),
  ).toString();
  const suffix = query ? `?${query}` : '';
  const response = await fetch(`${session.url}/rest/v1/${path}${suffix}`, {
    method: 'HEAD',
    headers: {
      apikey: session.key,
      Authorization: `Bearer ${session.token}`,
      Prefer: 'count=exact',
    },
  });
  const range = response.headers.get('content-range') ?? '';
  return Number(range.split('/').pop() ?? Number.NaN);
}

const DIFFICULTY = 'Normal';
const DURATION_MS = 183456;
const ALIAS = 'Sisal Verifier';
const OTHER_ALIAS = 'Other Player';

let owner;
let stranger;
let runRecordId;

test('anonymous sign-ins yield distinct owners', { skip }, async () => {
  owner = await signInAnonymously(config);
  stranger = await signInAnonymously(config);

  assert.ok(owner.token && stranger.token, 'both sessions must hold an access token');
  assert.notEqual(
    owner.userId,
    stranger.userId,
    'the two sessions must be different users, otherwise every denial below is vacuous',
  );
});

test('owner records a rescued run end to end', { skip }, async () => {
  const preferences = await postgrest('player_preferences', owner, {
    method: 'POST',
    body: { user_id: owner.userId, stats_opt_in: true, rescue_opt_in: true },
  });
  assert.ok(preferences.ok, `preferences insert failed with ${preferences.status}`);

  const insert = await postgrest('run_records', owner, {
    method: 'POST',
    body: {
      user_id: owner.userId,
      client_run_id: crypto.randomUUID(),
      difficulty: DIFFICULTY,
    },
  });
  assert.ok(insert.ok, `run insert failed with ${insert.status}`);
  assert.equal(rowsOf(insert).length, 1, 'insert must return the created row');
  runRecordId = rowsOf(insert)[0]?.id;
  assert.ok(runRecordId, 'insert must expose the new run id');

  const finish = await postgrest(`run_records?id=eq.${runRecordId}`, owner, {
    method: 'PATCH',
    body: { outcome: 'rescued', duration_ms: DURATION_MS, floor_reached: 7, mementos: 4 },
  });
  assert.ok(finish.ok, `terminal update failed with ${finish.status}`);

  const rescue = await postgrest('public_rescue_entries', owner, {
    method: 'POST',
    body: {
      run_record_id: runRecordId,
      owner_id: owner.userId,
      display_alias: ALIAS,
      difficulty: DIFFICULTY,
      duration_ms: DURATION_MS,
      mementos: 4,
    },
  });
  assert.ok(rescue.ok, `rescue insert failed with ${rescue.status}`);
});

test('owner can read their own private rows', { skip }, async () => {
  const read = await postgrest('run_records', owner);
  assert.ok(read.ok, `owner read failed with ${read.status}`);
  assert.ok(rowsOf(read).some((row) => row.id === runRecordId), 'owner must see their own run');
});

test('a stranger cannot read another owner private rows', { skip }, async () => {
  const read = await postgrest('run_records', stranger);
  assert.equal(
    rowsOf(read).filter((row) => row.user_id === owner.userId).length,
    0,
    'RLS must return no rows owned by another user',
  );
  assert.equal(
    rowsOf(read).length,
    0,
    'a fresh stranger must see an empty private table',
  );
});

test('a stranger cannot read another owner preferences', { skip }, async () => {
  const read = await postgrest('player_preferences', stranger);
  assert.equal(rowsOf(read).length, 0, 'preferences must stay owner-scoped');
});

test('a stranger cannot update or delete another owner run', { skip }, async () => {
  const update = await postgrest(`run_records?id=eq.${runRecordId}`, stranger, {
    method: 'PATCH',
    body: { floor_reached: 1 },
  });
  assert.equal(rowsOf(update).length, 0, 'a denied update must affect no rows');

  const remove = await postgrest(`run_records?id=eq.${runRecordId}`, stranger, {
    method: 'DELETE',
  });
  assert.equal(rowsOf(remove).length, 0, 'a denied delete must affect no rows');

  assert.equal(
    await countRows('run_records', owner, { id: runRecordId }),
    1,
    "the owner's run must survive a stranger's delete",
  );
});

test('a stranger cannot forge a rescue entry on another owner run', { skip }, async () => {
  const forged = await postgrest('public_rescue_entries', stranger, {
    method: 'POST',
    body: {
      run_record_id: runRecordId,
      owner_id: stranger.userId,
      display_alias: OTHER_ALIAS,
      difficulty: DIFFICULTY,
      duration_ms: 1000,
      mementos: 0,
    },
  });

  const created = rowsOf(forged).filter((row) => row.owner_id === stranger.userId);
  assert.equal(created.length, 0, 'the composite owner foreign key must reject the forgery');
});

test('the leaderboard table is never directly readable', { skip }, async () => {
  const read = await postgrest('public_rescue_entries', owner);
  assert.equal(
    rowsOf(read).length,
    0,
    'public_rescue_entries has no SELECT grant, so reads must never return rows',
  );
});

test('run insert is refused without consent on file', { skip }, async () => {
  const fresh = await signInAnonymously(config);
  const session = { url: config.url, key: config.key, token: fresh.token };

  const insert = await postgrest('run_records', session, {
    method: 'POST',
    body: { user_id: fresh.userId, client_run_id: crypto.randomUUID(), difficulty: DIFFICULTY },
  });
  assert.equal(
    rowsOf(insert).length,
    0,
    'run_records insert must require a saved opt-in preference',
  );

  const deletion = await postgrest('rpc/delete_my_run_data', session, { method: 'POST', body: {} });
  assert.ok(deletion.ok, `cleanup failed with ${deletion.status}`);
});

test('public RPCs expose counts and allowlisted fields only', { skip }, async () => {
  const analytics = await postgrest('rpc/get_run_analytics', owner, { method: 'POST', body: {} });
  assert.ok(analytics.ok, `analytics RPC failed with ${analytics.status}`);

  const analyticsRow = rowsOf(analytics)[0] ?? {};
  assert.deepEqual(
    Object.keys(analyticsRow).sort(),
    ['in_progress_count', 'jumped_count', 'rescued_count', 'session_count', 'started_count'],
    'analytics must expose exactly the five aggregate counts',
  );
  for (const value of Object.values(analyticsRow)) {
    assert.ok(Number.isSafeInteger(value), 'aggregate counts must be integers');
  }

  const rescues = await postgrest('rpc/get_public_rescues', owner, { method: 'POST', body: {} });
  assert.ok(rescues.ok, `leaderboard RPC failed with ${rescues.status}`);

  const allowlist = ['created_at', 'display_alias', 'difficulty', 'duration_ms', 'mementos'];
  for (const entry of rowsOf(rescues)) {
    assert.deepEqual(
      Object.keys(entry).sort(),
      allowlist,
      'leaderboard rows must expose only allowlisted fields',
    );
    assert.ok(!('owner_id' in entry), 'leaderboard must never expose owner_id');
    assert.ok(!('user_id' in entry), 'leaderboard must never expose user_id');
  }
});

test('owner deletion removes the owner run and cascade its public entry', { skip }, async () => {
  const deletion = await postgrest('rpc/delete_my_run_data', owner, { method: 'POST', body: {} });
  assert.ok(deletion.ok, `owner deletion failed with ${deletion.status}`);

  assert.equal(
    await countRows('run_records', owner, { id: runRecordId }),
    0,
    'owner deletion must remove the private run',
  );

  const rescues = await postgrest('rpc/get_public_rescues', owner, { method: 'POST', body: {} });
  assert.ok(
    !rowsOf(rescues).some((entry) => entry.display_alias === ALIAS),
    'the cascaded public entry must disappear from the leaderboard',
  );

  const preferences = await countRows('player_preferences', owner, { user_id: owner.userId });
  assert.equal(preferences, 0, 'owner deletion must remove the preference row');
});

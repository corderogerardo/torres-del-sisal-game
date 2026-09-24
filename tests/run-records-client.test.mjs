import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runRecords = await import('../public/run-records.mjs').catch(() => null);

test('run-record client accepts only HTTPS public Supabase configuration', () => {
  assert.equal(typeof runRecords?.isValidSupabaseConfig, 'function', 'configuration validation must be exported');

  const { isValidSupabaseConfig } = runRecords;
  assert.equal(isValidSupabaseConfig({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }), true);
  assert.equal(isValidSupabaseConfig({ url: 'http://demo.supabase.co', publishableKey: 'sb_publishable_public' }), false);
  assert.equal(isValidSupabaseConfig({ url: 'https://demo.supabase.co', publishableKey: 'sb_secret_private' }), false);
  assert.equal(isValidSupabaseConfig({ url: 'https://demo.supabase.co', publishableKey: '' }), false);
});

test('public aliases are length-bounded and contain only the allowlisted characters', () => {
  assert.equal(typeof runRecords?.isValidDisplayAlias, 'function', 'alias validation must be exported');
  assert.equal(runRecords.isValidDisplayAlias('Sisal 7'), true);
  assert.equal(runRecords.isValidDisplayAlias('  '), false);
  assert.equal(runRecords.isValidDisplayAlias('<img src=x>'), false);
  assert.equal(runRecords.isValidDisplayAlias('é'), false);
  assert.equal(runRecords.isValidDisplayAlias('x'.repeat(25)), false);
});

test('no opt-in prevents config loading, SDK loading, and authentication', async () => {
  assert.equal(typeof runRecords?.createOptionalRunClient, 'function', 'lazy client factory must be exported');
  let configLoads = 0;
  let sdkLoads = 0;
  let authCalls = 0;
  const integration = runRecords.createOptionalRunClient({
    loadConfig: async () => { configLoads += 1; return null; },
    loadSdk: async () => { sdkLoads += 1; return {}; },
  });

  assert.equal(await integration.connect({ statsOptIn: false, rescueOptIn: false }), false);
  assert.deepEqual({ configLoads, sdkLoads, authCalls }, { configLoads: 0, sdkLoads: 0, authCalls: 0 });
});

test('invalid or secret-key configuration prevents SDK loading and auth requests', async () => {
  let sdkLoads = 0;
  const integration = runRecords?.createOptionalRunClient({
    loadConfig: async () => ({ url: 'https://demo.supabase.co', publishableKey: 'sb_secret_private' }),
    loadSdk: async () => { sdkLoads += 1; return {}; },
  });

  assert.equal(await integration?.connect({ statsOptIn: true }), false);
  assert.equal(sdkLoads, 0);
});

test('valid opt-in creates a non-persistent anonymous Supabase session once', async () => {
  let sdkLoads = 0;
  let authCalls = 0;
  let clientOptions;
  const client = { auth: { signInAnonymously: async () => { authCalls += 1; return { data: { user: { id: 'opaque' } }, error: null }; } } };
  const integration = runRecords?.createOptionalRunClient({
    loadConfig: async () => ({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }),
    loadSdk: async () => {
      sdkLoads += 1;
      return { createClient: (url, key, options) => {
        clientOptions = { url, key, ...options };
        return client;
      } };
    },
  });

  assert.equal(await integration?.connect({ rescueOptIn: true }), true);
  assert.equal(await integration?.connect({ statsOptIn: true }), true);
  assert.deepEqual(clientOptions, {
    url: 'https://demo.supabase.co',
    key: 'sb_publishable_public',
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  assert.deepEqual({ sdkLoads, authCalls }, { sdkLoads: 1, authCalls: 1 });
});

test('Supabase auth errors disable the optional integration without throwing', async () => {
  const integration = runRecords?.createOptionalRunClient({
    loadConfig: async () => ({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }),
    loadSdk: async () => ({ createClient: () => ({ auth: { signInAnonymously: async () => ({ data: null, error: new Error('offline') }) } }) }),
  });

  assert.equal(await integration?.connect({ statsOptIn: true }), false);
});

test('saved preferences remain separate, owner-scoped, and free of IP or device fields', async () => {
  const calls = [];
  const client = {
    auth: { signInAnonymously: async () => ({ data: { user: { id: 'session-owner' } }, error: null }) },
    from: (table) => ({
      upsert: async (record) => { calls.push({ table, record }); return { error: null }; },
    }),
  };
  const integration = runRecords?.createOptionalRunClient({
    loadConfig: async () => ({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }),
    loadSdk: async () => ({ createClient: () => client }),
  });

  assert.equal(typeof integration?.savePreferences, 'function', 'data adapter must persist consent preferences');
  assert.equal(await integration.savePreferences({ statsOptIn: true, rescueOptIn: false }), true);
  assert.equal(calls[0].table, 'player_preferences');
  assert.deepEqual({
    user_id: calls[0].record.user_id,
    stats_opt_in: calls[0].record.stats_opt_in,
    rescue_opt_in: calls[0].record.rescue_opt_in,
  }, { user_id: 'session-owner', stats_opt_in: true, rescue_opt_in: false });
  assert.equal(Number.isNaN(Date.parse(calls[0].record.updated_at)), false);
  assert.doesNotMatch(JSON.stringify(calls), /ip|device|email|user_agent/i);
});

test('run start creates one owner-private in-progress row after recording consent', async () => {
  const requests = [];
  const client = {
    auth: { signInAnonymously: async () => ({ data: { user: { id: 'session-owner' } }, error: null }) },
    from: (table) => ({
      upsert: async (record) => { requests.push({ table, operation: 'upsert', record }); return { error: null }; },
      insert(record) {
        requests.push({ table, operation: 'insert', record });
        return {
          select: () => ({ single: async () => ({ data: { id: 'private-run-row' }, error: null }) }),
        };
      },
    }),
  };
  const integration = runRecords?.createOptionalRunClient({
    loadConfig: async () => ({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }),
    loadSdk: async () => ({ createClient: () => client }),
  });
  const input = {
    clientRunId: 'c6b7d9c0-f04c-4e65-8d86-14119608d2f1',
    difficulty: 'Pesadilla',
    consent: { statsOptIn: true, rescueOptIn: false },
  };

  assert.equal(typeof integration?.startRun, 'function', 'data adapter must record run starts');
  assert.equal(await integration.startRun(input), 'private-run-row');
  assert.equal(await integration.startRun(input), 'private-run-row');
  assert.deepEqual(requests.map(({ table, operation }) => ({ table, operation })), [
    { table: 'player_preferences', operation: 'upsert' },
    { table: 'run_records', operation: 'insert' },
  ]);
  assert.deepEqual(requests[1].record, {
    user_id: 'session-owner',
    client_run_id: input.clientRunId,
    difficulty: 'Pesadilla',
    outcome: 'in_progress',
    floor_reached: 1,
    mementos: 0,
  });
  assert.doesNotMatch(JSON.stringify(requests), /ip|device|email|user_agent/i);
});

test('rescued outcomes submit once and publish only allowlisted opted-in fields', async () => {
  const requests = [];
  const client = {
    auth: { signInAnonymously: async () => ({ data: { user: { id: 'session-owner' } }, error: null }) },
    from: (table) => ({
      upsert: async (record) => { requests.push({ table, operation: 'upsert', record }); return { error: null }; },
      insert(record) {
        requests.push({ table, operation: 'insert', record });
        return {
          select: () => ({ single: async () => ({ data: { id: 'private-run-row' }, error: null }) }),
          then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject),
        };
      },
      update(record) {
        const request = { table, operation: 'update', record };
        requests.push(request);
        return {
          eq: (column, value) => { request.filter = { column, value }; return this; },
          then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject),
        };
      },
    }),
  };
  const integration = runRecords?.createOptionalRunClient({
    loadConfig: async () => ({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }),
    loadSdk: async () => ({ createClient: () => client }),
  });
  const consent = { statsOptIn: true, rescueOptIn: true };
  const summary = {
    clientRunId: 'c6b7d9c0-f04c-4e65-8d86-14119608d2f1',
    difficulty: 'Normal', outcome: 'rescued', durationMs: 183456,
    floorReached: 7, mementos: 4, displayAlias: 'Sisalia 7',
  };

  assert.equal(typeof integration?.finishRun, 'function', 'data adapter must submit terminal outcomes');
  const runId = await integration.startRun({ ...summary, consent });
  assert.equal(await integration.finishRun(summary, { consent }), true);
  assert.equal(await integration.finishRun(summary, { consent }), false);

  const privateUpdate = requests.find((request) => request.table === 'run_records' && request.operation === 'update');
  assert.deepEqual(privateUpdate.record, {
    outcome: 'rescued', duration_ms: 183456, floor_reached: 7, mementos: 4,
  });
  assert.deepEqual(privateUpdate.filter, { column: 'id', value: runId });
  const publicEntry = requests.find((request) => request.table === 'public_rescue_entries');
  assert.deepEqual(publicEntry.record, {
    run_record_id: runId,
    owner_id: 'session-owner',
    display_alias: 'Sisalia 7',
    difficulty: 'Normal',
    duration_ms: 183456,
    mementos: 4,
  });
  assert.doesNotMatch(JSON.stringify(requests), /ip|device|email|user_agent|service_role/i);
});

test('jumped terminal outcomes remain private even when publication is opted in', async () => {
  const tables = [];
  const client = {
    auth: { signInAnonymously: async () => ({ data: { user: { id: 'session-owner' } }, error: null }) },
    from: (table) => ({
      upsert: async () => ({ error: null }),
      insert: (record) => {
        tables.push({ table, operation: 'insert', record });
        return { select: () => ({ single: async () => ({ data: { id: 'private-run-row' }, error: null }) }) };
      },
      update: (record) => {
        tables.push({ table, operation: 'update', record });
        return { eq: () => ({ then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject) }) };
      },
    }),
  };
  const integration = runRecords?.createOptionalRunClient({
    loadConfig: async () => ({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }),
    loadSdk: async () => ({ createClient: () => client }),
  });
  const consent = { statsOptIn: true, rescueOptIn: true };
  const run = {
    clientRunId: 'c6b7d9c0-f04c-4e65-8d86-14119608d2f1',
    difficulty: 'Pesadilla', outcome: 'jumped', durationMs: 240000,
    floorReached: 7, mementos: 1,
  };

  const runId = await integration?.startRun({ ...run, consent });
  assert.equal(await integration?.finishRun(run, { consent }), true);
  assert.equal(tables.some(({ table }) => table === 'public_rescue_entries'), false);
  assert.equal(tables.find(({ table, operation }) => table === 'run_records' && operation === 'update')?.record.outcome, 'jumped');
  assert.ok(runId);
});

test('failed public publishing is reported as a non-throwing submission failure', async () => {
  const client = {
    auth: { signInAnonymously: async () => ({ data: { user: { id: 'session-owner' } }, error: null }) },
    from: (table) => table === 'run_records'
      ? { update: () => ({ eq: () => ({ then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject) }) }) }
      : { insert: () => ({ then: (resolve, reject) => Promise.resolve({ error: new Error('offline') }).then(resolve, reject) }) },
  };
  const integration = runRecords?.createOptionalRunClient({
    loadConfig: async () => ({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }),
    loadSdk: async () => ({ createClient: () => client }),
  });
  const result = await integration?.finishRun({
    clientRunId: 'c6b7d9c0-f04c-4e65-8d86-14119608d2f1',
    difficulty: 'Normal', outcome: 'rescued', durationMs: 183456,
    floorReached: 7, mementos: 4, displayAlias: 'Sisal 7',
  }, { consent: { rescueOptIn: true }, runId: 'private-run-row' });

  assert.equal(result, false);
});

test('public reads return allowlisted fields and aggregate counts only after opt-in', async () => {
  const rpcCalls = [];
  const client = {
    auth: { signInAnonymously: async () => ({ data: { user: { id: 'session-owner' } }, error: null }) },
    from: () => ({ upsert: async () => ({ error: null }) }),
    rpc: async (name) => {
      rpcCalls.push(name);
      if (name === 'get_run_analytics') return { data: [{ started_count: 8, in_progress_count: 2, rescued_count: 3, jumped_count: 3, session_count: 4, email: 'private' }], error: null };
      return { data: [{ display_alias: 'Sisalia', difficulty: 'Normal', duration_ms: 183456, mementos: 4, created_at: '2026-01-01T00:00:00Z', owner_id: 'private' }], error: null };
    },
  };
  const integration = runRecords?.createOptionalRunClient({
    loadConfig: async () => ({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }),
    loadSdk: async () => ({ createClient: () => client }),
  });

  assert.equal(typeof integration?.loadPublicData, 'function', 'data adapter must read public aggregates and rescues');
  assert.equal(await integration.loadPublicData({ statsOptIn: false, rescueOptIn: false }), null);
  const data = await integration.loadPublicData({ statsOptIn: true, rescueOptIn: false });
  assert.deepEqual(rpcCalls, ['get_run_analytics', 'get_public_rescues']);
  assert.deepEqual(data.analytics, {
    started: 8, inProgress: 2, rescued: 3, jumped: 3, anonymousSessions: 4,
  });
  assert.deepEqual(data.rescues, [{
    displayAlias: 'Sisalia', difficulty: 'Normal', durationMs: 183456,
    mementos: 4, createdAt: '2026-01-01T00:00:00Z',
  }]);
  assert.equal(data.unavailable, false);
  assert.doesNotMatch(JSON.stringify(data), /owner|email|ip|device/i);
});

test('public data reports RPC failures without throwing', async () => {
  const client = {
    auth: { signInAnonymously: async () => ({ data: { user: { id: 'session-owner' } }, error: null }) },
    rpc: async (name) => name === 'get_run_analytics'
      ? { data: null, error: new Error('offline') }
      : { data: [], error: null },
  };
  const integration = runRecords?.createOptionalRunClient({
    loadConfig: async () => ({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }),
    loadSdk: async () => ({ createClient: () => client }),
  });

  const data = await integration?.loadPublicData({ statsOptIn: true });
  assert.equal(data?.unavailable, true);
  assert.equal(data?.analytics, null);
  assert.deepEqual(data?.rescues, []);
});

test('owner can delete live-session run data without exposing auth identity', async () => {
  const rpcCalls = [];
  const client = {
    auth: { signInAnonymously: async () => ({ data: { user: { id: 'session-owner' } }, error: null }) },
    from: () => ({ upsert: async () => ({ error: null }) }),
    rpc: async (name) => { rpcCalls.push(name); return { data: null, error: null }; },
  };
  const integration = runRecords?.createOptionalRunClient({
    loadConfig: async () => ({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }),
    loadSdk: async () => ({ createClient: () => client }),
  });

  assert.equal(typeof integration?.deleteMyRunData, 'function', 'data adapter must support owner deletion');
  assert.equal(await integration.deleteMyRunData(), false);
  assert.equal(await integration.savePreferences({ rescueOptIn: true }), true);
  assert.equal(await integration.deleteMyRunData(), true);
  assert.deepEqual(rpcCalls, ['delete_my_run_data']);
});

test('owner deletion waits for a pending terminal submission', async () => {
  const rpcCalls = [];
  let releaseUpdate;
  const terminalWrite = new Promise((resolve) => { releaseUpdate = resolve; });
  const client = {
    auth: { signInAnonymously: async () => ({ data: { user: { id: 'session-owner' } }, error: null }) },
    from: (table) => ({
      upsert: async () => ({ error: null }),
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'private-run-row' }, error: null }) }) }),
      update: () => ({ eq: () => ({ then: (resolve, reject) => terminalWrite.then(() => ({ error: null })).then(resolve, reject) }) }),
    }),
    rpc: async (name) => { rpcCalls.push(name); return { data: null, error: null }; },
  };
  const integration = runRecords?.createOptionalRunClient({
    loadConfig: async () => ({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }),
    loadSdk: async () => ({ createClient: () => client }),
  });
  const consent = { statsOptIn: true };
  const clientRunId = 'c6b7d9c0-f04c-4e65-8d86-14119608d2f1';
  await integration.startRun({ clientRunId, difficulty: 'Normal', consent });
  const finish = integration.finishRun({
    clientRunId, difficulty: 'Normal', outcome: 'jumped', durationMs: 183456,
    floorReached: 7, mementos: 4,
  }, { consent, runId: 'private-run-row' });
  const deletion = integration.deleteMyRunData();

  await Promise.resolve();
  assert.deepEqual(rpcCalls, []);
  releaseUpdate();
  assert.equal(await finish, true);
  assert.equal(await deletion, true);
  assert.deepEqual(rpcCalls, ['delete_my_run_data']);
});

test('local provider config is ignored and no token storage is used', async () => {
  const gitignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  const source = await readFile(new URL('../public/run-records.mjs', import.meta.url), 'utf8').catch(() => '');
  assert.match(gitignore, /public\/supabase-config\.js/);
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage)\b/);
  assert.match(source, /@supabase\/supabase-js@2\.\d+\.\d+/);
});

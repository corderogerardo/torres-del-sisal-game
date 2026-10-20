import assert from 'node:assert/strict';
import test from 'node:test';

const runTelemetry = await import('../public/run-telemetry.mjs').catch(() => null);

const CLIENT_RUN_ID = 'c6b7d9c0-f04c-4e65-8d86-14119608d2f1';

class MemoryRunOutbox {
  records = new Map();

  constructor(records = []) {
    for (const record of records) this.records.set(record.clientRunId, { ...record });
  }

  async enqueue(record) {
    const previous = this.records.get(record.clientRunId);
    this.records.set(record.clientRunId, { ...record, queuedAt: previous?.queuedAt ?? record.queuedAt ?? 1 });
  }

  async list() { return [...this.records.values()].map((record) => ({ ...record })); }
  async remove(clientRunId) { this.records.delete(clientRunId); }
  async clear() { this.records.clear(); }
  isAvailable() { return true; }
}

function createClient(runOutbox, client, loadConfig = async () => ({
  url: 'https://demo.supabase.co',
  publishableKey: 'sb_publishable_public',
})) {
  return runTelemetry.createRunTelemetryClient({
    runOutbox,
    loadConfig,
    loadSdk: async () => ({ createClient: () => client }),
  });
}

function createRun(outcome = 'rescued') {
  return {
    clientRunId: CLIENT_RUN_ID,
    difficulty: 'Normal',
    outcome,
    durationMs: 183456,
    floorReached: 7,
    mementos: 4,
  };
}

test('configuration accepts only HTTPS Supabase publishable or anonymous keys', () => {
  assert.equal(typeof runTelemetry?.isValidSupabaseConfig, 'function');
  assert.equal(runTelemetry.isValidSupabaseConfig({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }), true);
  assert.equal(runTelemetry.isValidSupabaseConfig({ url: 'http://demo.supabase.co', publishableKey: 'sb_publishable_public' }), false);
  assert.equal(runTelemetry.isValidSupabaseConfig({ url: 'https://demo.supabase.co', publishableKey: 'sb_secret_private' }), false);
});

test('telemetry defaults on and remembers an explicit local opt-out', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };

  assert.equal(runTelemetry.getRunTelemetryEnabled(storage), true);
  assert.equal(runTelemetry.setRunTelemetryEnabled(false, storage), true);
  assert.equal(runTelemetry.getRunTelemetryEnabled(storage), false);
  assert.equal(runTelemetry.setRunTelemetryEnabled(true, storage), true);
  assert.equal(runTelemetry.getRunTelemetryEnabled(storage), true);
});

test('connecting creates a browser client without creating an Auth user', async () => {
  let sdkLoads = 0;
  let authCalls = 0;
  let clientOptions;
  const client = {
    auth: { signInAnonymously: async () => { authCalls += 1; return { data: {}, error: null }; } },
    rpc: async () => ({ data: [], error: null }),
  };
  const integration = runTelemetry.createRunTelemetryClient({
    loadConfig: async () => ({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }),
    loadSdk: async () => {
      sdkLoads += 1;
      return { createClient: (url, key, options) => {
        clientOptions = { url, key, ...options };
        return client;
      } };
    },
  });

  assert.equal(await integration.connect(), true);
  assert.equal(authCalls, 0);
  assert.equal(sdkLoads, 1);
  assert.deepEqual(clientOptions.auth, {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  });
});

test('run start is durably queued before the anonymous telemetry RPC', async () => {
  const events = [];
  const outbox = new MemoryRunOutbox();
  const enqueue = outbox.enqueue.bind(outbox);
  outbox.enqueue = async (record) => { events.push('enqueue'); return enqueue(record); };
  const client = {
    rpc: async (name, args) => {
      events.push(`rpc:${name}`);
      return { data: args.p_client_run_id, error: null };
    },
  };
  const integration = createClient(outbox, client);

  assert.equal(await integration.startRun({ clientRunId: CLIENT_RUN_ID, difficulty: 'Normal' }), true);
  assert.equal(events[0], 'enqueue');
  assert.ok(events.indexOf('enqueue') < events.findIndex((event) => event.startsWith('rpc:')));
  assert.deepEqual(events, ['enqueue', 'rpc:submit_game_run_telemetry']);
  assert.deepEqual([...outbox.records.values()], []);
});

test('a terminal outbox replay records its start first and uses only a per-run key', async () => {
  const run = createRun('jumped');
  const outbox = new MemoryRunOutbox([{ ...run, queuedAt: 1 }]);
  const calls = [];
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: args.p_client_run_id, error: null };
    },
  };
  const integration = createClient(outbox, client);

  const result = await integration.flushPendingRuns();

  assert.deepEqual(result, { synced: 1, pending: 0, runIds: { [CLIENT_RUN_ID]: CLIENT_RUN_ID } });
  assert.deepEqual(calls.map(({ args }) => args.p_outcome), ['in_progress', 'jumped']);
  assert.ok(calls.every(({ name }) => name === 'submit_game_run_telemetry'));
  assert.doesNotMatch(JSON.stringify(calls), /user_id|display_alias|username|email|ip_address|user_agent/i);
});

test('outbox retry retains the run until start and terminal are confirmed', async () => {
  const run = createRun();
  const outbox = new MemoryRunOutbox([{ ...run, queuedAt: 1 }]);
  const calls = [];
  const delays = [];
  let attempt = 0;
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      attempt += 1;
      if (attempt === 1) return { data: null, error: new Error('transient') };
      return { data: args.p_client_run_id, error: null };
    },
  };
  const integration = createClient(outbox, client);

  const result = await integration.flushPendingRuns({}, {
    attempts: 2,
    baseDelayMs: 1000,
    sleep: async (ms) => { delays.push(ms); },
  });

  assert.equal(result.synced, 1);
  assert.equal(result.pending, 0);
  assert.deepEqual(calls.map(({ args }) => args.p_outcome), ['in_progress', 'in_progress', 'rescued']);
  assert.deepEqual(delays, [1000]);
});

test('failed online delivery leaves a run queued without blocking terminal gameplay', async () => {
  const outbox = new MemoryRunOutbox();
  const client = { rpc: async () => ({ data: null, error: new Error('offline') }) };
  const integration = createClient(outbox, client);
  const run = createRun();

  assert.equal(await integration.startRun({ clientRunId: CLIENT_RUN_ID, difficulty: 'Normal', attempts: 1 }), false);
  assert.equal(await integration.finishRun(run, { attempts: 1 }), false);
  assert.equal(await integration.hasPendingRun(CLIENT_RUN_ID), true);
  assert.equal(outbox.records.get(CLIENT_RUN_ID).outcome, 'rescued');
});

test('a terminal direct write requires a confirmed start when IndexedDB is unavailable', async () => {
  const calls = [];
  const unavailableOutbox = {
    async enqueue() { throw new Error('IndexedDB unavailable'); },
    async list() { throw new Error('IndexedDB unavailable'); },
    async remove() {},
    async clear() { throw new Error('IndexedDB unavailable'); },
    isAvailable() { return false; },
  };
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: null, error: new Error('offline') };
    },
  };
  const integration = createClient(unavailableOutbox, client);

  assert.equal(await integration.startRun({ clientRunId: CLIENT_RUN_ID, difficulty: 'Normal' }), false);
  assert.equal(await integration.finishRun(createRun(), { attempts: 1 }), false);
  assert.deepEqual(calls.map(({ args }) => args.p_outcome), ['in_progress']);
});

test('aggregate reads expose only validated count and duration summaries', async () => {
  const calls = [];
  const client = {
    rpc: async (name) => {
      calls.push(name);
      return { data: [{
        started_count: '8', in_progress_count: '2', rescued_count: '3', jumped_count: '3',
        average_duration_ms: '183456', p50_duration_ms: '170000', p95_duration_ms: '310000',
        user_id: 'private', username: 'private',
      }], error: null };
    },
  };
  const integration = createClient(new MemoryRunOutbox(), client);

  assert.deepEqual(await integration.loadPublicData(), {
    analytics: {
      started: 8, inProgress: 2, rescued: 3, jumped: 3,
      averageDurationMs: 183456, p50DurationMs: 170000, p95DurationMs: 310000,
    },
    unavailable: false,
  });
  assert.deepEqual(calls, ['get_run_telemetry_aggregates']);
});

test('opt-out suppresses submissions and clears only unsent browser records', async () => {
  const outbox = new MemoryRunOutbox([{ ...createRun(), queuedAt: 1 }]);
  let rpcCalls = 0;
  const integration = createClient(outbox, { rpc: async () => { rpcCalls += 1; return { data: CLIENT_RUN_ID, error: null }; } });

  assert.equal(await integration.startRun({ clientRunId: CLIENT_RUN_ID, difficulty: 'Normal', enabled: false }), false);
  await integration.clearPendingRuns();
  assert.equal(rpcCalls, 0);
  assert.deepEqual(await outbox.list(), []);
  assert.equal(integration.deleteMyRunData, undefined);
});

test('opt-out cancels later RPCs from a flush that already listed queued runs', async () => {
  const first = { ...createRun('rescued'), queuedAt: 1 };
  const second = { ...createRun('jumped'), clientRunId: 'd6b7d9c0-f04c-4e65-8d86-14119608d2f2', queuedAt: 2 };
  const outbox = new MemoryRunOutbox([first, second]);
  const events = [];
  let optedOut = false;
  let markFirstRequest;
  let releaseFirstRequest;
  const firstRequest = new Promise((resolve) => { markFirstRequest = resolve; });
  const requestGate = new Promise((resolve) => { releaseFirstRequest = resolve; });
  const client = {
    rpc: async (_name, args) => {
      events.push({ outcome: args.p_outcome, optedOut });
      if (events.length === 1) {
        markFirstRequest();
        await requestGate;
      }
      return { data: args.p_client_run_id, error: null };
    },
  };
  const integration = createClient(outbox, client);
  const flush = integration.flushPendingRuns({}, { attempts: 1 });

  await firstRequest;
  optedOut = true;
  await integration.clearPendingRuns();
  releaseFirstRequest();
  await flush;

  assert.deepEqual(events.filter((event) => event.optedOut), []);
  assert.equal(outbox.records.size, 0);
});

test('missing local configuration keeps telemetry queued without loading the SDK', async () => {
  const outbox = new MemoryRunOutbox();
  let sdkLoads = 0;
  const integration = runTelemetry.createRunTelemetryClient({
    runOutbox: outbox,
    loadConfig: async () => null,
    loadSdk: async () => { sdkLoads += 1; return {}; },
  });

  assert.equal(await integration.startRun({ clientRunId: CLIENT_RUN_ID, difficulty: 'Normal', attempts: 1 }), false);
  assert.equal(sdkLoads, 0);
  assert.equal(await integration.hasPendingRun(CLIENT_RUN_ID), true);
});

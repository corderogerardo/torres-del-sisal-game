import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runTelemetry = await import('../public/run-telemetry.mjs').catch(() => null);
const runOutbox = await import('../public/run-outbox.mjs').catch(() => null);
const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

const clientRunId = 'c6b7d9c0-f04c-4e65-8d86-14119608d2f1';

class MemoryStorageAdapter {
  records = new Map();

  async enqueue(record) {
    this.records.set(record.clientRunId, { ...record });
    return { ...record };
  }

  async list() { return [...this.records.values()].map((record) => ({ ...record })); }
  async remove(id) { this.records.delete(id); }
  async clear() { this.records.clear(); }
}

function createRunOutboxAdapter() {
  const storageAdapter = new MemoryStorageAdapter();
  return { storageAdapter, outbox: runOutbox.createRunOutbox({ storageAdapter }) };
}

test('durable outbox strips legacy usernames and consent fields from pending run data', async () => {
  const storageAdapter = new MemoryStorageAdapter();
  const legacyRecord = {
    clientRunId,
    difficulty: 'Normal',
    outcome: 'rescued',
    durationMs: 183456,
    floorReached: 7,
    mementos: 4,
    displayAlias: 'Sisalia 7',
    statsOptIn: true,
    publishRescue: true,
    user_id: 'legacy-user-id',
    queuedAt: 100,
  };
  await storageAdapter.enqueue(legacyRecord);
  const outbox = runOutbox.createRunOutbox({ storageAdapter });

  const expected = {
    clientRunId,
    difficulty: 'Normal',
    outcome: 'rescued',
    durationMs: 183456,
    floorReached: 7,
    mementos: 4,
    queuedAt: 100,
  };
  assert.deepEqual(await outbox.list(), [expected]);
  assert.deepEqual([...storageAdapter.records.values()], [expected]);
});

test('every enabled run starts through the public RPC without creating an Auth identity', async () => {
  const calls = [];
  const { outbox } = createRunOutboxAdapter();
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: args.p_client_run_id, error: null };
    },
  };
  const integration = runTelemetry.createRunTelemetryClient({
    runOutbox: outbox,
    loadConfig: async () => ({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }),
    loadSdk: async () => ({ createClient: () => client }),
  });

  assert.equal(await integration.startRun({ clientRunId, difficulty: 'Normal' }), true);
  assert.deepEqual(calls, [{
    name: 'submit_game_run_telemetry',
    args: {
      p_client_run_id: clientRunId,
      p_difficulty: 'Normal',
      p_outcome: 'in_progress',
      p_duration_ms: null,
      p_floor_reached: 1,
      p_mementos: 0,
    },
  }]);
  assert.equal('auth' in client, false);
  assert.doesNotMatch(JSON.stringify(calls), /user_id|display_alias|email|ip_address|user_agent/i);
});

test('aggregate reads expose run counts and duration percentiles without individual rows', async () => {
  const calls = [];
  const { outbox } = createRunOutboxAdapter();
  const client = {
    rpc: async (name) => {
      calls.push(name);
      return {
        data: [{
          started_count: '8', in_progress_count: '2', rescued_count: '3', jumped_count: '3',
          average_duration_ms: '183456', p50_duration_ms: '170000', p95_duration_ms: '310000',
          user_id: 'must-not-escape', username: 'must-not-escape',
        }],
        error: null,
      };
    },
  };
  const integration = runTelemetry.createRunTelemetryClient({
    runOutbox: outbox,
    loadConfig: async () => ({ url: 'https://demo.supabase.co', publishableKey: 'sb_publishable_public' }),
    loadSdk: async () => ({ createClient: () => client }),
  });

  assert.deepEqual(await integration.loadPublicData(), {
    analytics: {
      started: 8, inProgress: 2, rescued: 3, jumped: 3,
      averageDurationMs: 183456, p50DurationMs: 170000, p95DurationMs: 310000,
    },
    unavailable: false,
  });
  assert.deepEqual(calls, ['get_run_telemetry_aggregates']);
});

test('identity-free telemetry has no player deletion endpoint', () => {
  const { outbox } = createRunOutboxAdapter();
  const integration = runTelemetry.createRunTelemetryClient({ runOutbox: outbox });

  assert.equal(integration.deleteMyRunData, undefined);
});

test('player disclosure describes automatic aggregate collection without identity or deletion controls', () => {
  assert.match(page, /se recopilan automáticamente|se guardan automáticamente|se registran automáticamente/i);
  assert.match(page, /agregad[oa]s/i);
  assert.match(page, /no se guarda un nombre de usuario ni un identificador de jugador/i);
  assert.match(page, /id="runTelemetryOptOut"/);
  assert.doesNotMatch(page, /id="(?:statsOptIn|rescueOptIn|displayAlias|deleteRunRecords(?:End)?)"/);
  assert.match(page, /Supabase puede procesar la dirección IP y el agente de usuario/i);
});

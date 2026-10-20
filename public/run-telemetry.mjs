import { createRunOutbox } from './run-outbox.mjs';

const SUPABASE_SDK_URL = 'https://esm.sh/@supabase/supabase-js@2.58.0?bundle';
const DIFFICULTIES = new Set(['Piadoso', 'Normal', 'Pesadilla']);
const TERMINAL_OUTCOMES = new Set(['rescued', 'jumped']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TELEMETRY_OPT_OUT_KEY = 'tds-run-telemetry-opt-out-v1';

export function getRunTelemetryEnabled(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    return target?.getItem(TELEMETRY_OPT_OUT_KEY) !== 'true';
  } catch {
    return true;
  }
}

export function setRunTelemetryEnabled(enabled, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    if (enabled) target.removeItem(TELEMETRY_OPT_OUT_KEY);
    else target.setItem(TELEMETRY_OPT_OUT_KEY, 'true');
    return true;
  } catch {
    return false;
  }
}

function isAnonymousJwt(key) {
  const payload = key.split('.')[1];
  if (!payload) return false;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(decoded).role === 'anon';
  } catch {
    return false;
  }
}

export function isValidSupabaseConfig(config) {
  if (!config || typeof config.url !== 'string' || typeof config.publishableKey !== 'string') return false;

  try {
    const url = new URL(config.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return false;
  } catch {
    return false;
  }

  const key = config.publishableKey.trim();
  return key.startsWith('sb_publishable_') ? key.length > 'sb_publishable_'.length : isAnonymousJwt(key);
}

function isValidRunSummary(summary) {
  return UUID_PATTERN.test(summary?.clientRunId || '')
    && DIFFICULTIES.has(summary?.difficulty)
    && TERMINAL_OUTCOMES.has(summary?.outcome)
    && Number.isInteger(summary?.durationMs)
    && summary.durationMs >= 1000
    && summary.durationMs <= 7200000
    && Number.isInteger(summary?.floorReached)
    && summary.floorReached >= 1
    && summary.floorReached <= 7
    && Number.isInteger(summary?.mementos)
    && summary.mementos >= 0
    && summary.mementos <= 6;
}

export function createRunSession({
  now = () => globalThis.performance?.now?.() ?? Number.NaN,
  createClientRunId = () => globalThis.crypto?.randomUUID?.() ?? null,
} = {}) {
  let activeRun = null;

  function start(difficulty) {
    if (!DIFFICULTIES.has(difficulty)) return null;
    const clientRunId = createClientRunId();
    const startedAt = now();
    if (!UUID_PATTERN.test(clientRunId || '') || !Number.isFinite(startedAt)) return null;
    activeRun = { clientRunId, difficulty, startedAt, submitted: false };
    return { clientRunId, difficulty };
  }

  function finish({ outcome, floorReached, mementos } = {}) {
    if (!activeRun || activeRun.submitted || !TERMINAL_OUTCOMES.has(outcome)) return null;
    if (!Number.isInteger(floorReached) || floorReached < 1 || floorReached > 7) return null;
    if (!Number.isInteger(mementos) || mementos < 0 || mementos > 6) return null;

    const durationMs = Math.floor(now() - activeRun.startedAt);
    if (!Number.isInteger(durationMs) || durationMs < 1000 || durationMs > 7200000) return null;

    activeRun.submitted = true;
    return {
      clientRunId: activeRun.clientRunId,
      difficulty: activeRun.difficulty,
      outcome,
      durationMs,
      floorReached,
      mementos,
    };
  }

  return { start, finish };
}

function getAnalyticsSummary(response) {
  if (response?.error) return null;
  const row = Array.isArray(response?.data) ? response.data[0] : response?.data;
  if (!row) return null;
  const values = [
    row.started_count,
    row.in_progress_count,
    row.rescued_count,
    row.jumped_count,
    row.average_duration_ms,
    row.p50_duration_ms,
    row.p95_duration_ms,
  ].map(Number);
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) return null;
  const [started, inProgress, rescued, jumped, averageDurationMs, p50DurationMs, p95DurationMs] = values;
  return { started, inProgress, rescued, jumped, averageDurationMs, p50DurationMs, p95DurationMs };
}

async function loadLocalConfig() {
  try {
    return (await import('./supabase-config.js')).default;
  } catch {
    return null;
  }
}

async function loadSupabaseSdk() {
  return import(SUPABASE_SDK_URL);
}

const defaultSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export function createRunTelemetryClient({
  loadConfig = loadLocalConfig,
  loadSdk = loadSupabaseSdk,
  runOutbox = createRunOutbox(),
} = {}) {
  let clientPromise = null;
  let telemetryEnabled = true;
  let telemetryGeneration = 0;
  const startRequests = new Map();
  const terminalRequests = new Map();
  const confirmedStarts = new Set();
  const submittedRunIds = new Set();

  function setEnabled(enabled) {
    const next = enabled === true;
    if (telemetryEnabled !== next) telemetryGeneration += 1;
    telemetryEnabled = next;
    return telemetryEnabled;
  }

  function isCurrentGeneration(generation) {
    return telemetryEnabled && telemetryGeneration === generation;
  }

  async function getClient() {
    if (!clientPromise) {
      clientPromise = (async () => {
        const config = await loadConfig();
        if (!isValidSupabaseConfig(config)) return null;
        const { createClient } = await loadSdk();
        return createClient(config.url, config.publishableKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
      })().catch(() => null);
    }

    const client = await clientPromise;
    if (!client) clientPromise = null;
    return client;
  }

  async function submitRunTelemetry(client, record) {
    try {
      const { data, error } = await client.rpc('submit_game_run_telemetry', {
        p_client_run_id: record.clientRunId,
        p_difficulty: record.difficulty,
        p_outcome: record.outcome,
        p_duration_ms: record.durationMs,
        p_floor_reached: record.floorReached,
        p_mementos: record.mementos,
      });
      return !error && typeof data === 'string' && data.toLowerCase() === record.clientRunId.toLowerCase();
    } catch {
      return false;
    }
  }

  async function hasPendingRun(clientRunId) {
    try {
      return (await runOutbox.list()).some((record) => record.clientRunId === clientRunId);
    } catch {
      return null;
    }
  }

  async function clearPendingRuns() {
    setEnabled(false);
    try {
      await runOutbox.clear();
      return true;
    } catch {
      return runOutbox.isAvailable?.() === false;
    }
  }

  async function flushPendingRuns({ enabled = true } = {}, {
    attempts = 3,
    baseDelayMs = 1500,
    sleep = defaultSleep,
  } = {}) {
    if (enabled !== true) {
      setEnabled(false);
      return { synced: 0, pending: null, runIds: {} };
    }
    if (!telemetryEnabled) return { synced: 0, pending: null, runIds: {} };
    const generation = telemetryGeneration;

    let records;
    try {
      records = await runOutbox.list();
    } catch {
      return { synced: 0, pending: null, runIds: {} };
    }

    let synced = 0;
    const runIds = {};
    for (const record of records) {
      if (!isCurrentGeneration(generation)) break;
      let saved = false;
      for (let attempt = 0; attempt < attempts && !saved && isCurrentGeneration(generation); attempt += 1) {
        const client = await getClient();
        if (!isCurrentGeneration(generation)) break;
        if (client) {
          if (record.outcome === 'in_progress') {
            saved = await submitRunTelemetry(client, record);
          } else {
            const startRecord = {
              ...record,
              outcome: 'in_progress',
              durationMs: null,
              floorReached: 1,
              mementos: 0,
            };
            const startSaved = await submitRunTelemetry(client, startRecord);
            if (!isCurrentGeneration(generation)) break;
            if (startSaved) saved = await submitRunTelemetry(client, record);
          }
        }
        if (!isCurrentGeneration(generation)) break;
        if (!saved && attempt + 1 < attempts) await sleep(baseDelayMs * 2 ** attempt);
      }

      if (!isCurrentGeneration(generation)) break;
      if (!saved) continue;
      runIds[record.clientRunId] = record.clientRunId;
      try {
        await runOutbox.remove(record.clientRunId);
        synced += 1;
      } catch {
        // A retry is safe because the database RPC is idempotent per run UUID.
      }
    }

    try {
      return { synced, pending: (await runOutbox.list()).length, runIds };
    } catch {
      return { synced, pending: null, runIds };
    }
  }

  function startRun({ clientRunId, difficulty, enabled = true, attempts, baseDelayMs, sleep } = {}) {
    if (enabled !== true) setEnabled(false);
    if (enabled !== true || !telemetryEnabled || !UUID_PATTERN.test(clientRunId || '') || !DIFFICULTIES.has(difficulty)) {
      return Promise.resolve(false);
    }
    const generation = telemetryGeneration;
    if (startRequests.has(clientRunId)) return startRequests.get(clientRunId);

    const queuedRecord = {
      clientRunId,
      difficulty,
      outcome: 'in_progress',
      durationMs: null,
      floorReached: 1,
      mementos: 0,
    };
    const request = (async () => {
      try {
        await runOutbox.enqueue(queuedRecord);
        if (!isCurrentGeneration(generation)) return false;
        const result = await flushPendingRuns({ enabled }, { attempts, baseDelayMs, sleep });
        if (!isCurrentGeneration(generation)) return false;
        const saved = result.runIds[clientRunId] === clientRunId;
        if (saved) confirmedStarts.add(clientRunId);
        return saved;
      } catch {
        if (!isCurrentGeneration(generation)) return false;
        const client = await getClient();
        if (!isCurrentGeneration(generation)) return false;
        const saved = Boolean(client && await submitRunTelemetry(client, queuedRecord));
        if (saved && isCurrentGeneration(generation)) confirmedStarts.add(clientRunId);
        return saved && isCurrentGeneration(generation);
      }
    })();

    startRequests.set(clientRunId, request);
    return request;
  }

  async function submitTerminalRun(summary, { attempts = 3, baseDelayMs = 1500, sleep = defaultSleep, generation } = {}) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (!isCurrentGeneration(generation)) return false;
      const client = await getClient();
      if (!isCurrentGeneration(generation)) return false;
      if (client && await submitRunTelemetry(client, summary)) return isCurrentGeneration(generation);
      if (attempt + 1 < attempts) await sleep(baseDelayMs * 2 ** attempt);
    }
    return false;
  }

  function finishRun(summary, { enabled = true, attempts, baseDelayMs, sleep } = {}) {
    if (enabled !== true) setEnabled(false);
    if (enabled !== true || !telemetryEnabled || !isValidRunSummary(summary)) return Promise.resolve(false);
    const generation = telemetryGeneration;
    if (submittedRunIds.has(summary.clientRunId)) return Promise.resolve(false);
    submittedRunIds.add(summary.clientRunId);

    const request = (async () => {
      try {
        await runOutbox.enqueue(summary);
        if (!isCurrentGeneration(generation)) return false;
        const result = await flushPendingRuns({ enabled }, { attempts, baseDelayMs, sleep });
        if (!isCurrentGeneration(generation)) return false;
        return result.runIds[summary.clientRunId] === summary.clientRunId
          && await hasPendingRun(summary.clientRunId) === false;
      } catch {
        if (!isCurrentGeneration(generation)) return false;
        const startRequest = startRequests.get(summary.clientRunId);
        const startWasConfirmed = confirmedStarts.has(summary.clientRunId)
          || Boolean(startRequest && await startRequest);
        if (!isCurrentGeneration(generation) || !startWasConfirmed) return false;
        const saved = await submitTerminalRun(summary, { attempts, baseDelayMs, sleep, generation });
        if (saved) confirmedStarts.delete(summary.clientRunId);
        return saved;
      }
    })();

    terminalRequests.set(summary.clientRunId, request);
    return request.then((result) => {
      if (terminalRequests.get(summary.clientRunId) === request) terminalRequests.delete(summary.clientRunId);
      return result;
    });
  }

  async function loadPublicData({ enabled = true } = {}) {
    if (enabled !== true) {
      setEnabled(false);
      return null;
    }
    if (!telemetryEnabled) return null;
    const generation = telemetryGeneration;
    const client = await getClient();
    if (!client || !isCurrentGeneration(generation)) return null;

    try {
      const response = await client.rpc('get_run_telemetry_aggregates');
      if (!isCurrentGeneration(generation)) return null;
      return {
        analytics: getAnalyticsSummary(response),
        unavailable: Boolean(response?.error),
      };
    } catch {
      return { analytics: null, unavailable: true };
    }
  }

  return {
    connect: async ({ enabled = true } = {}) => enabled === true && telemetryEnabled && Boolean(await getClient()),
    setEnabled,
    startRun,
    finishRun,
    loadPublicData,
    flushPendingRuns,
    clearPendingRuns,
    hasPendingRun,
  };
}

const SUPABASE_SDK_URL = 'https://esm.sh/@supabase/supabase-js@2.58.0?bundle';
const DIFFICULTIES = new Set(['Piadoso', 'Normal', 'Pesadilla']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function isValidRunSummary(summary) {
  return UUID_PATTERN.test(summary?.clientRunId || '')
    && DIFFICULTIES.has(summary?.difficulty)
    && ['rescued', 'jumped'].includes(summary?.outcome)
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

function getPublicAlias(alias) {
  if (typeof alias !== 'string') return null;
  const trimmed = alias.trim();
  return trimmed.length >= 1 && trimmed.length <= 24 && /^[A-Za-z0-9 _-]+$/.test(trimmed)
    ? trimmed
    : null;
}

export function isValidDisplayAlias(alias) {
  return getPublicAlias(alias) !== null;
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
    if (!activeRun || activeRun.submitted || !['rescued', 'jumped'].includes(outcome)) return null;
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
  const values = [row.started_count, row.in_progress_count, row.rescued_count, row.jumped_count, row.session_count]
    .map(Number);
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) return null;
  const [started, inProgress, rescued, jumped, anonymousSessions] = values;
  return { started, inProgress, rescued, jumped, anonymousSessions };
}

function getPublicRescues(response) {
  if (response?.error || !Array.isArray(response?.data)) return [];
  return response.data.flatMap((entry) => {
    const displayAlias = getPublicAlias(entry.display_alias);
    const durationMs = Number(entry.duration_ms);
    const mementos = Number(entry.mementos);
    if (!displayAlias || !DIFFICULTIES.has(entry.difficulty)) return [];
    if (!Number.isInteger(durationMs) || durationMs < 1000 || durationMs > 7200000) return [];
    if (!Number.isInteger(mementos) || mementos < 0 || mementos > 6) return [];
    if (typeof entry.created_at !== 'string' || Number.isNaN(Date.parse(entry.created_at))) return [];
    return [{ displayAlias, difficulty: entry.difficulty, durationMs, mementos, createdAt: entry.created_at }];
  }).slice(0, 30);
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

export function createOptionalRunClient({ loadConfig = loadLocalConfig, loadSdk = loadSupabaseSdk } = {}) {
  let sessionPromise = null;
  const startRequests = new Map();
  const terminalRequests = new Map();
  const submittedRunIds = new Set();
  let deletionPromise = null;

  async function getSession(consent = {}) {
    if (consent.statsOptIn !== true && consent.rescueOptIn !== true && !sessionPromise) return null;

    if (!sessionPromise) {
      sessionPromise = (async () => {
        const config = await loadConfig();
        if (!isValidSupabaseConfig(config)) return null;
        const { createClient } = await loadSdk();
        const client = createClient(config.url, config.publishableKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
        const { data, error } = await client.auth.signInAnonymously();
        if (error || !data?.user?.id) return null;
        return { client, userId: data.user.id };
      })().catch(() => null);
    }

    const session = await sessionPromise;
    if (!session) sessionPromise = null;
    return session;
  }

  async function connect(consent = {}) {
    return Boolean(await getSession(consent));
  }

  async function savePreferences(consent = {}) {
    const session = await getSession(consent);
    if (!session) return false;

    try {
      const { error } = await session.client.from('player_preferences').upsert({
        user_id: session.userId,
        stats_opt_in: consent.statsOptIn === true,
        rescue_opt_in: consent.rescueOptIn === true,
        updated_at: new Date().toISOString(),
      });
      return !error;
    } catch {
      return false;
    }
  }

  function startRun({ clientRunId, difficulty, consent = {} } = {}) {
    if (!UUID_PATTERN.test(clientRunId || '') || !DIFFICULTIES.has(difficulty)) return Promise.resolve(null);
    if (consent.statsOptIn !== true && consent.rescueOptIn !== true) return Promise.resolve(null);
    if (startRequests.has(clientRunId)) return startRequests.get(clientRunId);

    const request = (async () => {
      const session = await getSession(consent);
      if (!session || !await savePreferences(consent)) return null;

      try {
        const { data, error } = await session.client.from('run_records').insert({
          user_id: session.userId,
          client_run_id: clientRunId,
          difficulty,
          outcome: 'in_progress',
          floor_reached: 1,
          mementos: 0,
        }).select('id').single();
        if (error) return null;
        return data?.id ?? null;
      } catch {
        return null;
      }
    })();

    startRequests.set(clientRunId, request);
    return request;
  }

  async function submitTerminalRun(summary, consent, runId) {
    try {
      const pendingStart = startRequests.get(summary.clientRunId);
      const savedRunId = runId || (pendingStart ? await pendingStart : null);
      const session = await getSession(consent);
      if (!session) return false;
      if (!savedRunId && !await savePreferences(consent)) return false;

      const terminalRecord = {
        outcome: summary.outcome,
        duration_ms: summary.durationMs,
        floor_reached: summary.floorReached,
        mementos: summary.mementos,
      };
      let recordId = savedRunId;

      if (recordId) {
        const { error } = await session.client.from('run_records')
          .update(terminalRecord)
          .eq('id', recordId);
        if (error) return false;
      } else {
        const { data, error } = await session.client.from('run_records').insert({
          user_id: session.userId,
          client_run_id: summary.clientRunId,
          difficulty: summary.difficulty,
          ...terminalRecord,
        }).select('id').single();
        if (error || !data?.id) return false;
        recordId = data.id;
      }

      const displayAlias = getPublicAlias(summary.displayAlias);
      if (summary.outcome === 'rescued' && consent.rescueOptIn === true && displayAlias) {
        const { error } = await session.client.from('public_rescue_entries').insert({
          run_record_id: recordId,
          owner_id: session.userId,
          display_alias: displayAlias,
          difficulty: summary.difficulty,
          duration_ms: summary.durationMs,
          mementos: summary.mementos,
        });
        if (error) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  function finishRun(summary, { consent = {}, runId = null } = {}) {
    if (!isValidRunSummary(summary)) return Promise.resolve(false);
    if (consent.statsOptIn !== true && consent.rescueOptIn !== true) return Promise.resolve(false);
    if (submittedRunIds.has(summary.clientRunId)) return Promise.resolve(false);
    submittedRunIds.add(summary.clientRunId);

    const request = submitTerminalRun(summary, consent, runId);
    terminalRequests.set(summary.clientRunId, request);
    return request.then((result) => {
      if (terminalRequests.get(summary.clientRunId) === request) terminalRequests.delete(summary.clientRunId);
      return result;
    });
  }

  async function loadPublicData(consent = {}) {
    if (consent.statsOptIn !== true && consent.rescueOptIn !== true) return null;
    const session = await getSession(consent);
    if (!session) return null;

    try {
      const analyticsRequest = consent.statsOptIn === true
        ? session.client.rpc('get_run_analytics')
        : Promise.resolve(null);
      const [analyticsResponse, rescuesResponse] = await Promise.all([
        analyticsRequest,
        session.client.rpc('get_public_rescues'),
      ]);
      return {
        analytics: consent.statsOptIn === true ? getAnalyticsSummary(analyticsResponse) : null,
        rescues: getPublicRescues(rescuesResponse),
        unavailable: Boolean(analyticsResponse?.error || rescuesResponse?.error),
      };
    } catch {
      return { analytics: null, rescues: [], unavailable: true };
    }
  }

  function deleteMyRunData() {
    if (deletionPromise) return deletionPromise;
    if (!sessionPromise) return Promise.resolve(false);

    deletionPromise = (async () => {
      await Promise.all([...startRequests.values(), ...terminalRequests.values()]);
      const session = await sessionPromise;
      if (!session) return false;

      try {
        const { error } = await session.client.rpc('delete_my_run_data');
        if (error) return false;
        sessionPromise = null;
        startRequests.clear();
        terminalRequests.clear();
        submittedRunIds.clear();
        return true;
      } catch {
        return false;
      }
    })().finally(() => { deletionPromise = null; });
    return deletionPromise;
  }

  return { connect, savePreferences, startRun, finishRun, loadPublicData, deleteMyRunData };
}

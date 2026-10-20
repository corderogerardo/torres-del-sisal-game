import assert from 'node:assert/strict';
import test from 'node:test';

const runOutbox = await import('../public/run-outbox.mjs').catch(() => null);

class MemoryStorageAdapter {
  records = new Map();

  async enqueue(record) {
    const previous = this.records.get(record.clientRunId);
    const stored = { ...record, queuedAt: previous?.queuedAt ?? record.queuedAt };
    this.records.set(record.clientRunId, stored);
    return { ...stored };
  }

  async list() { return [...this.records.values()].map((record) => ({ ...record })); }
  async remove(clientRunId) { this.records.delete(clientRunId); }
  async clear() { this.records.clear(); }
}

class FakeIndexedDB {
  stores = new Map();

  open() {
    const request = {};
    queueMicrotask(() => {
      request.result = {
        objectStoreNames: { contains: (name) => this.stores.has(name) },
        createObjectStore: (name) => { this.stores.set(name, new Map()); },
        transaction: (name) => {
          const records = this.stores.get(name);
          let pending = 0;
          const tx = {
            objectStore: () => ({
              get: (key) => requestFor(() => records.get(key)),
              put: (record) => requestFor(() => records.set(record.clientRunId, { ...record })),
              getAll: () => requestFor(() => [...records.values()].map((record) => ({ ...record }))),
              delete: (key) => requestFor(() => records.delete(key)),
              clear: () => requestFor(() => records.clear()),
            }),
          };
          function requestFor(action) {
            const operation = {};
            pending += 1;
            queueMicrotask(() => {
              try { operation.result = action(); operation.onsuccess?.(); }
              catch (error) { operation.error = error; tx.onerror?.(); }
              finally {
                pending -= 1;
                if (pending === 0) queueMicrotask(() => { if (pending === 0) tx.oncomplete?.(); });
              }
            });
            return operation;
          }
          return tx;
        },
      };
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }
}

test('run outbox persists run data without aliases, identities, or consent flags', async () => {
  assert.equal(typeof runOutbox?.createRunOutbox, 'function', 'outbox factory must be exported');
  const outbox = runOutbox.createRunOutbox({ storageAdapter: new MemoryStorageAdapter() });
  const record = {
    clientRunId: 'c6b7d9c0-f04c-4e65-8d86-14119608d2f1',
    difficulty: 'Normal', outcome: 'rescued', durationMs: 183456,
    floorReached: 7, mementos: 4, displayAlias: 'Sisalia 7',
    publishRescue: true, queuedAt: 100, user_id: 'private-user', ip: '192.0.2.1', token: 'secret',
  };

  await outbox.enqueue(record);

  assert.deepEqual(await outbox.list(), [{
    clientRunId: record.clientRunId,
    difficulty: 'Normal', outcome: 'rescued', durationMs: 183456,
    floorReached: 7, mementos: 4, queuedAt: 100,
  }]);
});

test('enqueue returns only the allowlisted stored copy', async () => {
  const storage = new MemoryStorageAdapter();
  const enqueue = storage.enqueue.bind(storage);
  storage.enqueue = async (record) => ({ ...(await enqueue(record)), user_id: 'private-user' });
  const outbox = runOutbox.createRunOutbox({ storageAdapter: storage });

  const result = await outbox.enqueue({
    clientRunId: 'c6b7d9c0-f04c-4e65-8d86-14119608d2f1',
    difficulty: 'Normal', outcome: 'rescued', durationMs: 183456,
    floorReached: 7, mementos: 4, queuedAt: 100,
  });

  assert.deepEqual(Object.keys(result).sort(), [
    'clientRunId', 'difficulty', 'durationMs', 'floorReached', 'mementos', 'outcome', 'queuedAt',
  ]);
});

test('outbox preserves only the run summary for delayed delivery', async () => {
  const outbox = runOutbox.createRunOutbox({ storageAdapter: new MemoryStorageAdapter() });
  const record = {
    ...createProgressRecord('c6b7d9c0-f04c-4e65-8d86-14119608d2f1', 100),
    statsOptIn: true,
    publishRescue: true,
    displayAlias: 'Sisal 7',
  };

  await outbox.enqueue(record);

  assert.deepEqual(await outbox.list(), [createProgressRecord(record.clientRunId, 100)]);
});

test('native IndexedDB storage replays oldest records and upserts by stable run ID', async () => {
  const indexedDB = new FakeIndexedDB();
  const first = createProgressRecord('c6b7d9c0-f04c-4e65-8d86-14119608d2f1', 100);
  const second = { ...createProgressRecord('d6b7d9c0-f04c-4e65-8d86-14119608d2f2', 50), outcome: 'jumped', durationMs: 1500 };
  const outbox = runOutbox.createRunOutbox({ indexedDB });

  await outbox.enqueue(first);
  await outbox.enqueue({ ...first, outcome: 'rescued', durationMs: 183456, queuedAt: 200 });
  await outbox.enqueue(second);

  const reloaded = runOutbox.createRunOutbox({ indexedDB });
  assert.deepEqual((await reloaded.list()).map(({ clientRunId, outcome, queuedAt }) => ({ clientRunId, outcome, queuedAt })), [
    { clientRunId: second.clientRunId, outcome: 'jumped', queuedAt: 50 },
    { clientRunId: first.clientRunId, outcome: 'rescued', queuedAt: 100 },
  ]);
  await reloaded.remove(second.clientRunId);
  await reloaded.clear();
  assert.deepEqual(await outbox.list(), []);
});

test('invalid records reject without changing the queued data', async () => {
  const outbox = runOutbox.createRunOutbox({ storageAdapter: new MemoryStorageAdapter() });
  const valid = createProgressRecord('c6b7d9c0-f04c-4e65-8d86-14119608d2f1', 100);
  await outbox.enqueue(valid);
  const invalidRecords = [
    { clientRunId: 'not-a-uuid' },
    { clientRunId: new String(valid.clientRunId) },
    { difficulty: 'Impossible' },
    { outcome: 'abandoned' },
    { durationMs: 1 },
    { floorReached: 0 },
    { floorReached: 8 },
    { mementos: -1 },
    { mementos: 7 },
    { outcome: 'rescued', durationMs: 999 },
    { outcome: 'jumped', durationMs: 7200001 },
  ];

  for (const changes of invalidRecords) {
    await assert.rejects(outbox.enqueue({ ...valid, ...changes }), TypeError);
  }
  assert.deepEqual(await outbox.list(), [valid]);
});

test('unavailable and failed IndexedDB reject instead of appearing empty', async () => {
  const unavailable = runOutbox.createRunOutbox({ indexedDB: undefined });
  await assert.rejects(unavailable.list(), /IndexedDB is unavailable/);

  const failed = runOutbox.createRunOutbox({ indexedDB: {
    open() {
      const request = {};
      queueMicrotask(() => { request.error = new Error('storage denied'); request.onerror?.(); });
      return request;
    },
  } });
  await assert.rejects(failed.list(), /storage denied/);
});

test('outbox reports whether durable storage is available without opening it', () => {
  assert.equal(runOutbox.createRunOutbox({ indexedDB: new FakeIndexedDB() }).isAvailable(), true);
  assert.equal(runOutbox.createRunOutbox({ indexedDB: undefined }).isAvailable(), false);
  assert.equal(runOutbox.createRunOutbox({ storageAdapter: new MemoryStorageAdapter() }).isAvailable(), true);
});

function createProgressRecord(clientRunId, queuedAt) {
  return { clientRunId, difficulty: 'Normal', outcome: 'in_progress', durationMs: null, floorReached: 1, mementos: 0, queuedAt };
}

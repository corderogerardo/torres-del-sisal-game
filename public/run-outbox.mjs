const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIFFICULTIES = new Set(['Piadoso', 'Normal', 'Pesadilla']);
const TERMINAL_OUTCOMES = new Set(['rescued', 'jumped']);

function toAllowlistedRecord(record) {
  const inProgress = record?.outcome === 'in_progress';
  if (typeof record?.clientRunId !== 'string' || !UUID_PATTERN.test(record.clientRunId)
    || !DIFFICULTIES.has(record?.difficulty)
    || !(inProgress || TERMINAL_OUTCOMES.has(record?.outcome))
    || (inProgress ? record.durationMs !== null : !Number.isInteger(record.durationMs) || record.durationMs < 1000 || record.durationMs > 7200000)
    || !Number.isInteger(record.floorReached) || record.floorReached < 1 || record.floorReached > 7
    || !Number.isInteger(record.mementos) || record.mementos < 0 || record.mementos > 6) {
    throw new TypeError('Invalid run outbox record');
  }

  const allowed = {
    clientRunId: record.clientRunId,
    difficulty: record.difficulty,
    outcome: record.outcome,
    durationMs: record.durationMs,
    floorReached: record.floorReached,
    mementos: record.mementos,
  };
  allowed.queuedAt = Number.isSafeInteger(record.queuedAt) && record.queuedAt >= 0 ? record.queuedAt : Date.now();
  return allowed;
}

function createIndexedDBStorage(indexedDB, databaseName, storeName) {
  let databasePromise;
  function openDatabase() {
    if (!indexedDB?.open) return Promise.reject(new Error('IndexedDB is unavailable'));
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        let request;
        try { request = indexedDB.open(databaseName, 1); } catch (error) { reject(error); return; }
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName, { keyPath: 'clientRunId' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
        request.onblocked = () => reject(new Error('IndexedDB open request was blocked'));
      }).catch((error) => { databasePromise = null; throw error; });
    }
    return databasePromise;
  }

  async function transact(mode, action) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      let transaction;
      let value;
      try {
        transaction = database.transaction(storeName, mode);
        action(transaction.objectStore(storeName), (result) => { value = result; });
      } catch (error) { reject(error); return; }
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
  }

  return {
    enqueue: (record) => transact('readwrite', (store, setValue) => {
      const request = store.get(record.clientRunId);
      request.onsuccess = () => {
        const stored = { ...record, queuedAt: request.result?.queuedAt ?? record.queuedAt };
        setValue(stored);
        store.put(stored);
      };
    }),
    list: () => transact('readonly', (store, setValue) => {
      const request = store.getAll();
      request.onsuccess = () => setValue(request.result ?? []);
    }),
    remove: (clientRunId) => transact('readwrite', (store) => { store.delete(clientRunId); }),
    clear: () => transact('readwrite', (store) => { store.clear(); }),
  };
}

export function createRunOutbox({ indexedDB = globalThis.indexedDB, databaseName = 'torres-del-sisal-run-outbox', storeName = 'runs', storageAdapter } = {}) {
  const storage = storageAdapter ?? createIndexedDBStorage(indexedDB, databaseName, storeName);
  return {
    isAvailable() { return Boolean(storageAdapter || indexedDB?.open); },
    async enqueue(record) {
      const clean = toAllowlistedRecord(record);
      return toAllowlistedRecord(await storage.enqueue(clean));
    },
    async list() {
      const records = await storage.list();
      const cleanRecords = records.map(toAllowlistedRecord);
      for (let index = 0; index < records.length; index += 1) {
        const clean = cleanRecords[index];
        if (Object.keys(records[index]).some((key) => !Object.prototype.hasOwnProperty.call(clean, key))) {
          await storage.enqueue(clean);
        }
      }
      return cleanRecords.sort((a, b) => a.queuedAt - b.queuedAt);
    },
    async remove(clientRunId) { return storage.remove(clientRunId); },
    async clear() { return storage.clear(); },
  };
}

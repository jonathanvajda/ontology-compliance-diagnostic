// app/storage.js
// @ts-check

/**
 * IndexedDB persistence for OCQ saved runs and app-level pointers.
 *
 * Stable concepts:
 * - A run is either "single" or "batch".
 * - Payload shape is determined by the run kind.
 * - The "last" pointer stores the most recently saved run id.
 */

/** @typedef {import('./types.js').RunKind} RunKind */
/** @typedef {import('./types.js').SaveRunInput} SaveRunInput */
/** @typedef {import('./types.js').SavedRun} SavedRun */
/** @typedef {import('./types.js').LastRunPointer} LastRunPointer */

export const DB_NAME = 'ocd-db';
export const DB_VERSION = 1;

export const STORE_NAMES = Object.freeze({
  runs: 'runs',
  appState: 'appState'
});

/**
 * Returns the current timestamp in ISO 8601 format.
 *
 * @returns {string}
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Creates a reasonably unique id for a persisted run.
 *
 * @param {RunKind} prefix
 * @returns {string}
 */
function makeRunId(prefix) {
  const randomSuffix = Math.random().toString(16).slice(2);
  return `${prefix}_${Date.now()}_${randomSuffix}`;
}

/**
 * Validates the run kind.
 *
 * @param {unknown} value
 * @returns {asserts value is RunKind}
 */
function assertRunKind(value) {
  if (value !== 'single' && value !== 'batch') {
    throw new TypeError(`Invalid run kind: ${String(value)}`);
  }
}

/**
 * Converts an IndexedDB request into a promise.
 *
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T | null>}
 */
function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Resolves when a transaction completes, and rejects on error/abort.
 *
 * @param {IDBTransaction} transaction
 * @returns {Promise<void>}
 */
function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/**
 * Opens the OCQ IndexedDB database, creating stores if needed.
 *
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAMES.runs)) {
        const runsStore = db.createObjectStore(STORE_NAMES.runs, { keyPath: 'id' });
        runsStore.createIndex('byCreatedAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_NAMES.appState)) {
        db.createObjectStore(STORE_NAMES.appState, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Opens a transaction against a single object store, runs an operation,
 * waits for transaction completion, then closes the database.
 *
 * @template T
 * @param {string} storeName
 * @param {'readonly' | 'readwrite'} mode
 * @param {(store: IDBObjectStore, tx: IDBTransaction) => T | Promise<T>} operation
 * @returns {Promise<T>}
 */
async function runInStore(storeName, mode, operation) {
  const db = await openDatabase();

  try {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);

    const result = await operation(store, tx);
    await transactionToPromise(tx);

    return result;
  } finally {
    db.close();
  }
}

/**
 * Saves a run and updates the "last" pointer.
 *
 * @param {SaveRunInput} input
 * @returns {Promise<string>}
 */
export async function saveRun(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('saveRun() requires an input object.');
  }

  const { kind, label = '', payload, uiState = null } = input;
  assertRunKind(kind);

  if (payload == null) {
    throw new TypeError('saveRun() requires a payload.');
  }

  /** @type {SavedRun} */
  const run = {
    id: makeRunId(kind),
    kind,
    label: String(label || ''),
    createdAt: nowIso(),
    payload,
    uiState
  };

  await runInStore(STORE_NAMES.runs, 'readwrite', (store) => {
    return requestToPromise(store.put(run));
  });

  /** @type {LastRunPointer} */
  const lastPointer = {
    key: 'last',
    runId: run.id
  };

  await runInStore(STORE_NAMES.appState, 'readwrite', (store) => {
    return requestToPromise(store.put(lastPointer));
  });

  return run.id;
}

/**
 * Lists saved runs in descending createdAt order.
 *
 * @param {number} [limit=50]
 * @returns {Promise<SavedRun[]>}
 */
export async function listRuns(limit = 50) {
  const normalizedLimit =
    Number.isInteger(limit) && limit > 0 ? limit : 50;

  return runInStore(STORE_NAMES.runs, 'readonly', (store) => {
    const index = store.index('byCreatedAt');

    return new Promise((resolve, reject) => {
      /** @type {SavedRun[]} */
      const runs = [];

      const cursorRequest = index.openCursor(null, 'prev');

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          resolve(runs);
          return;
        }

        runs.push(/** @type {SavedRun} */ (cursor.value));

        if (runs.length >= normalizedLimit) {
          resolve(runs);
          return;
        }

        cursor.continue();
      };

      cursorRequest.onerror = () => reject(cursorRequest.error);
    });
  });
}

/**
 * Retrieves a saved run by id.
 *
 * @param {string} runId
 * @returns {Promise<SavedRun | null>}
 */
export async function getRun(runId) {
  if (!runId) {
    return null;
  }

  return runInStore(STORE_NAMES.runs, 'readonly', (store) => {
    return requestToPromise(/** @type {IDBRequest<SavedRun>} */ (store.get(runId)));
  });
}

/**
 * Deletes a saved run. If the deleted run is the current "last" pointer,
 * the pointer is removed as well.
 *
 * @param {string} runId
 * @returns {Promise<boolean>}
 */
export async function deleteRun(runId) {
  if (!runId) {
    return false;
  }

  const lastPointer = await runInStore(STORE_NAMES.appState, 'readonly', (store) => {
    return requestToPromise(/** @type {IDBRequest<LastRunPointer>} */ (store.get('last')));
  });

  if (lastPointer && lastPointer.runId === runId) {
    await runInStore(STORE_NAMES.appState, 'readwrite', (store) => {
      return requestToPromise(store.delete('last'));
    });
  }

  await runInStore(STORE_NAMES.runs, 'readwrite', (store) => {
    return requestToPromise(store.delete(runId));
  });

  return true;
}

/**
 * Returns the saved run id stored in the "last" pointer, if any.
 *
 * @returns {Promise<string | null>}
 */
export async function getLastRunId() {
  const lastPointer = await runInStore(STORE_NAMES.appState, 'readonly', (store) => {
    return requestToPromise(/** @type {IDBRequest<LastRunPointer>} */ (store.get('last')));
  });

  return lastPointer?.runId || null;
}
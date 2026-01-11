// app/storage.js (ES module)
// IndexedDB persistence for OCQ runs (single + batch) and "last run" pointer.

const DB_NAME = 'ocq-db';
const DB_VERSION = 1;

const STORES = {
  runs: 'runs',          // keyPath: id
  appState: 'appState'   // keyPath: key
};

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  const rnd = Math.random().toString(16).slice(2);
  return `${prefix}_${Date.now()}_${rnd}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORES.runs)) {
        const runs = db.createObjectStore(STORES.runs, { keyPath: 'id' });
        runs.createIndex('byCreatedAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.appState)) {
        db.createObjectStore(STORES.appState, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);

    let ret;
    try {
      ret = fn(store);
    } catch (e) {
      reject(e);
      return;
    }

    t.oncomplete = () => resolve(ret);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRun({ kind, label, payload, uiState }) {
  const db = await openDb();

  const run = {
    id: makeId(kind),            // 'single' | 'batch'
    kind,
    label: label || '',
    createdAt: nowIso(),
    payload,                     // report object (single) OR batch array
    uiState: uiState || null
  };

  await tx(db, STORES.runs, 'readwrite', (store) => reqToPromise(store.put(run)));

  // update last pointer
  await tx(db, STORES.appState, 'readwrite', (store) =>
    reqToPromise(store.put({ key: 'last', runId: run.id }))
  );

  db.close();
  return run.id;
}

export async function listRuns(limit = 50) {
  const db = await openDb();
  const runs = await tx(db, STORES.runs, 'readonly', async (store) => {
    const idx = store.index('byCreatedAt');
    const out = [];

    return new Promise((resolve, reject) => {
      const cursorReq = idx.openCursor(null, 'prev');
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return resolve(out);
        out.push(cursor.value);
        if (out.length >= limit) return resolve(out);
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  });

  db.close();
  return runs;
}

export async function getRun(runId) {
  const db = await openDb();
  const run = await tx(db, STORES.runs, 'readonly', (store) => reqToPromise(store.get(runId)));
  db.close();
  return run;
}

export async function deleteRun(runId) {
  const db = await openDb();

  const last = await tx(db, STORES.appState, 'readonly', (store) => reqToPromise(store.get('last')));
  if (last && last.runId === runId) {
    await tx(db, STORES.appState, 'readwrite', (store) => reqToPromise(store.delete('last')));
  }

  await tx(db, STORES.runs, 'readwrite', (store) => reqToPromise(store.delete(runId)));
  db.close();
  return true;
}

export async function getLastRunId() {
  const db = await openDb();
  const last = await tx(db, STORES.appState, 'readonly', (store) => reqToPromise(store.get('last')));
  db.close();
  return last?.runId || null;
}

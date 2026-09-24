// In-memory document store with write-through to Firestore.
// Reads always come from memory, so the app keeps working (and stays fast) if
// Firestore is slow or unreachable; writes are persisted in the background.

const { randomUUID } = require('crypto');
const firestore = require('./firestore');

const PRELOADED = ['machines', 'operators', 'tasks', 'shifts', 'alerts', 'incidents', 'trainingProgress', 'behaviorLedger'];
const APPEND_ONLY_MEMORY_LIMIT = 500;
const LOAD_TIMEOUT_MS = 12000;

const collections = new Map();
const status = { firestore: false, loadedAt: null, lastWriteError: null, pendingWrites: 0 };

function col(name) {
  if (!collections.has(name)) collections.set(name, new Map());
  return collections.get(name);
}

function clone(doc) {
  return doc === undefined || doc === null ? null : structuredClone(doc);
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms)),
  ]);
}

function persist(name, id, data) {
  if (!firestore.isEnabled()) return;
  status.pendingWrites += 1;
  firestore
    .write(name, id, data)
    .catch((err) => {
      status.lastWriteError = `${name}/${id}: ${err.code || ''} ${err.message}`;
      console.error(`[Firestore] Write failed ${name}/${id}:`, err.code || '', err.message);
    })
    .finally(() => {
      status.pendingWrites -= 1;
    });
}

async function init() {
  status.firestore = firestore.init();
  if (!status.firestore) return status;

  try {
    await withTimeout(
      Promise.all(
        PRELOADED.map(async (name) => {
          const docs = await firestore.getAll(name);
          const map = col(name);
          docs.forEach((d) => map.set(d.id, d));
        })
      ),
      LOAD_TIMEOUT_MS,
      'Firestore load'
    );
    status.loadedAt = new Date().toISOString();
    const counts = PRELOADED.map((n) => `${n}=${col(n).size}`).join(' ');
    console.log(`[Firestore] Loaded ${counts}`);
  } catch (err) {
    firestore.disable(err.message);
    status.firestore = false;
  }
  return status;
}

function get(name, id) {
  return clone(col(name).get(id));
}

function list(name, predicate = () => true) {
  return Array.from(col(name).values()).filter(predicate).map(clone);
}

function put(name, id, data) {
  const doc = { ...data, id };
  col(name).set(id, clone(doc));
  persist(name, id, doc);
  return clone(doc);
}

function patch(name, id, partial) {
  const existing = col(name).get(id) || {};
  return put(name, id, { ...existing, ...partial });
}

function add(name, data) {
  return put(name, data.id || randomUUID(), data);
}

// Append-only log: kept in a bounded in-memory ring, fully persisted to Firestore.
function append(name, data) {
  const doc = { ...data, id: data.id || randomUUID() };
  const map = col(name);
  map.set(doc.id, doc);
  if (map.size > APPEND_ONLY_MEMORY_LIMIT) {
    map.delete(map.keys().next().value);
  }
  persist(name, doc.id, doc);
  return doc;
}

function isEmpty(name) {
  return col(name).size === 0;
}

function getStatus() {
  return { ...status, firestore: firestore.isEnabled() };
}

module.exports = {
  init,
  get,
  list,
  put,
  patch,
  add,
  append,
  isEmpty,
  getStatus,
};

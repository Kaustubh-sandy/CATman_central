const { initializeApp } = require('firebase/app');
const {
  initializeFirestore,
  doc,
  setDoc,
  getDocs,
  collection,
  deleteDoc,
} = require('firebase/firestore');
const config = require('../config/env');

let db = null;

function init() {
  const fb = config.firebase;
  if (!fb.apiKey || !fb.projectId) {
    console.warn('[Firestore] No Firebase config in .env — running in-memory only.');
    return false;
  }

  const app = initializeApp(fb);
  db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  console.log(`[Firestore] Using project ${fb.projectId}`);
  return true;
}

function isEnabled() {
  return db !== null;
}

function disable(reason) {
  console.error(`[Firestore] Disabled: ${reason}. Continuing in-memory.`);
  db = null;
}

async function getAll(collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function write(collectionName, id, data) {
  await setDoc(doc(db, collectionName, id), data);
}

async function remove(collectionName, id) {
  await deleteDoc(doc(db, collectionName, id));
}

module.exports = {
  init,
  isEnabled,
  disable,
  getAll,
  write,
  remove,
};

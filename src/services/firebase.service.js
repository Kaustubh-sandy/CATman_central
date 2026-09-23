const admin = require('firebase-admin');
const config = require('../config/env');

let db = null;
let isConfigured = false;

const { projectId, clientEmail, privateKey } = config.firebase;

if (projectId && clientEmail && privateKey) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    db = admin.firestore();
    isConfigured = true;
    console.log(`[Firebase] Connected to Firestore project: ${projectId}`);
  } catch (error) {
    console.error('[Firebase] Failed to initialize Firebase Admin SDK:', error.message);
  }
} else {
  console.warn(
    '[Firebase] Credentials missing in .env (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).'
  );
  console.warn('[Firebase] Running with in-memory fallback until Firestore credentials are provided.');
}

module.exports = {
  admin,
  db,
  isConfigured: () => isConfigured,
};

const dotenv = require('dotenv');

dotenv.config();

function formatPrivateKey(key) {
  if (!key) return null;
  return key.replace(/\\n/g, '\n');
}

const config = {
  port: parseInt(process.env.PORT, 10) || 8000,
  host: process.env.HOST || '0.0.0.0',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8000',
  simulatorIntervalMs: parseInt(process.env.SIMULATOR_INTERVAL_MS, 10) || 4000,
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || null,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || null,
    privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
  },
};

module.exports = config;

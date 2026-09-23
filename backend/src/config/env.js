const dotenv = require('dotenv');

dotenv.config();

function int(name, fallback) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : fallback;
}

const config = {
  port: int('PORT', 8000),
  host: process.env.HOST || '0.0.0.0',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mqttUrl: process.env.MQTT_URL || 'mqtt://localhost:1883',
  heartbeatStaleSec: int('HEARTBEAT_STALE_SEC', 10),
  heartbeatOfflineSec: int('HEARTBEAT_OFFLINE_SEC', 20),

  precheckAckTimeoutMs: int('PRECHECK_TIMEOUT_MS', 5000),
  precheckAutoResultTimeoutMs: int('PRECHECK_AUTO_RESULT_TIMEOUT_MS', 15000),
  precheckManualTimeoutMs: int('PRECHECK_MANUAL_TIMEOUT_MS', 10 * 60 * 1000),
  hornTestWindowMs: int('HORN_TEST_WINDOW_MS', 10000),
  alertEscalationMs: int('ALERT_ESCALATION_MS', 15000),
  blackBoxWindowMs: int('BLACK_BOX_WINDOW_MS', 60000),
  idleLessonAfterSec: int('IDLE_LESSON_AFTER_SEC', 180),
  fuelPriceInr: int('FUEL_PRICE_INR', 95),

  firebase: {
    apiKey: process.env.FIREBASE_API_KEY || null,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || null,
    projectId: process.env.FIREBASE_PROJECT_ID || null,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || null,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || null,
    appId: process.env.FIREBASE_APP_ID || null,
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || null,
    models: (process.env.GEMINI_MODELS || 'gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    timeoutMs: int('GEMINI_TIMEOUT_MS', 25000),
  },
};

// Vite moves to 5174, 5175... when 5173 is busy, so any localhost port is accepted in
// addition to the configured CLIENT_URL. Requests without an Origin (curl, MQTT tools) pass.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isAllowedOrigin(origin) {
  return !origin || origin === config.clientUrl || LOCAL_ORIGIN.test(origin);
}

config.isAllowedOrigin = isAllowedOrigin;
config.corsOptions = {
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true,
};

module.exports = config;

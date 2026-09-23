// Scores the safety engine against the simulator's scenario labels.
// This is the ONLY place that reads telemetry.scenario — detection itself never does.
//
// Usage: npm run evaluate -- --seconds 300
// Leave it running while you trigger scenarios on the simulator page (http://localhost:3000).
const mqtt = require('mqtt');
const config = require('../config/env');
const { createSafetyEngine } = require('../services/safety.engine');

// Scenario -> rules that count as a correct detection. EXCESSIVE_IDLE and
// ABNORMAL_FUEL_CONSUMPTION are left to the ML model, not the rule engine.
const EXPECTED = {
  SEATBELT_VIOLATION: ['SEATBELT_VIOLATION'],
  OVERHEATING: ['OVERHEATING'],
  HIGH_VIBRATION: ['HIGH_VIBRATION'],
  PROXIMITY_HAZARD: ['PROXIMITY_WARNING', 'PROXIMITY_CRITICAL'],
  WORKER_NEARBY: ['PROXIMITY_CRITICAL'],
  ROLLOVER_RISK: ['ROLLOVER_RISK'],
  IMPACT: ['IMPACT'],
  OPERATOR_ABSENT: ['UNATTENDED_MACHINE', 'LOCKOUT_NOT_ENGAGED'],
  LOW_OIL_PRESSURE: ['LOW_OIL_PRESSURE'],
  OVERLOAD: ['OVERLOAD'],
};

function argSeconds() {
  const i = process.argv.indexOf('--seconds');
  return i > -1 ? Number(process.argv[i + 1]) : 180;
}

const engine = createSafetyEngine();
let site = {};
const samples = [];

const seconds = argSeconds();
const client = mqtt.connect(config.mqttUrl);

client.on('connect', () => {
  client.subscribe(['machines/+/telemetry', 'site/conditions']);
  console.log(`Recording telemetry for ${seconds} s from ${config.mqttUrl}. Trigger scenarios on the simulator now...`);
});

client.on('message', (topic, buffer) => {
  const payload = JSON.parse(buffer.toString());
  if (topic === 'site/conditions') {
    site = payload;
    return;
  }
  const machineId = topic.split('/')[1];
  const { conditions } = engine.evaluate(machineId, payload, { site });
  samples.push({ label: payload.scenario, fired: new Set(conditions.map((c) => c.ruleId)) });
});

setTimeout(() => {
  client.end();
  console.log(`\n${samples.length} telemetry messages\n`);
  console.log('Scenario'.padEnd(22), 'Samples'.padStart(8), 'Precision'.padStart(10), 'Recall'.padStart(8));

  Object.entries(EXPECTED).forEach(([scenario, rules]) => {
    const hit = (s) => rules.some((r) => s.fired.has(r));
    const labelled = samples.filter((s) => s.label === scenario);
    const tp = labelled.filter(hit).length;
    const fn = labelled.length - tp;
    const fp = samples.filter((s) => s.label !== scenario && hit(s)).length;
    const precision = tp + fp ? (tp / (tp + fp)).toFixed(2) : '—';
    const recall = tp + fn ? (tp / (tp + fn)).toFixed(2) : '—';
    console.log(scenario.padEnd(22), String(labelled.length).padStart(8), String(precision).padStart(10), String(recall).padStart(8));
  });

  console.log('\nNote: sustained rules (seatbelt 5 s, unattended 30 s) miss the first messages of an episode by design.');
  process.exit(0);
}, seconds * 1000);

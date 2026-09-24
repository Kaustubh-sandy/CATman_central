const http = require('http');
const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const repo = require('./db/repo');
const { ensureSeeded } = require('./db/seed');
const { initSocket } = require('./socket/socket');
const mqttService = require('./services/mqtt.service');
const siteService = require('./services/site.service');
const precheckService = require('./services/precheck.service');
const shiftService = require('./services/shift.service');
const alertService = require('./services/alert.service');
const idleLessonService = require('./services/idleLesson.service');
const taskService = require('./services/task.service');
const behaviorEngine = require('./services/behaviorEngine.service');
const etaService = require('./services/eta.service');
const behaviourService = require('./services/behaviour.service');
const anomalyService = require('./services/anomalyDetection.service');
const bus = require('./services/bus');

const app = express();
const server = http.createServer(app);

initSocket(server);

app.use(cors(config.corsOptions));
app.use(express.json());

app.use('/api/health', require('./routes/health.routes'));
app.use('/api/machines', require('./routes/machine.routes'));
app.use('/api/fleet', require('./routes/fleet.routes'));
app.use('/api/operators', require('./routes/operator.routes'));
app.use('/api/tasks', require('./routes/task.routes'));
app.use('/api/shift', require('./routes/shift.routes'));
app.use('/api/alerts', require('./routes/alert.routes'));
app.use('/api/incidents', require('./routes/incident.routes'));
app.use('/api/training', require('./routes/training.routes'));
app.use('/api/assistant', require('./routes/assistant.routes'));
app.use('/api/site', require('./routes/site.routes'));
app.use('/api/audit', require('./routes/audit.routes'));
app.use('/api/behavior', require('./routes/behavior.routes'));

app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON payload in request' });
  }
  const status = err.status || 500;
  if (status >= 500) console.error('[Server Error]', err);
  return res.status(status).json({ error: err.message || 'Internal Server Error', code: err.code || null });
});

async function start() {
  console.log('====================================================');
  console.log('       CAT SMART OPERATOR - BACKEND SERVICE         ');
  console.log('====================================================');

  await repo.init();
  ensureSeeded();

  siteService.init();
  precheckService.init();
  shiftService.init();
  alertService.init({ shiftLookup: shiftService.getActiveShiftForMachine });
  idleLessonService.init({ shiftLookup: shiftService.getActiveShiftForMachine });
  bus.on('telemetry', (machineId, telemetry) => taskService.onTelemetry(machineId, telemetry));
  etaService.init();
  anomalyService.init();
  behaviourService.init({ shiftLookup: shiftService.getActiveShiftForMachine });

  mqttService.init();

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n[Server] Port ${config.port} is already in use — another backend is probably running. Stop it first.\n`);
      process.exit(1);
    }
    throw error;
  });

  server.listen(config.port, config.host, () => {
    console.log(`Server running on: http://${config.host}:${config.port}`);
    console.log(`Local Access:      http://localhost:${config.port}`);
    console.log(`CORS Allowed:      ${config.clientUrl} (and any localhost / 127.0.0.1 port)`);
    console.log(`Storage:           ${repo.getStatus().firestore ? 'Firestore + memory' : 'memory only'}`);
    console.log(`Assistant:         ${config.gemini.apiKey ? `Gemini (${config.gemini.models[0]})` : 'offline keyword mode'}`);
    console.log('----------------------------------------------------');
  });
}

start().catch((err) => {
  console.error('[Startup] Failed:', err);
  process.exit(1);
});

module.exports = { app, server };

const http = require('http');
const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const { initSocket } = require('./socket/socket');
const { seedInitialMachines } = require('./services/machine.service');
const mqttService = require('./services/mqtt.service');

const healthRoutes = require('./routes/health.routes');
const machineRoutes = require('./routes/machine.routes');
const fleetRoutes = require('./routes/fleet.routes');
const taskRoutes = require('./routes/task.routes');
const operatorRoutes = require('./routes/operator.routes');
const siteRoutes = require('./routes/site.routes');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO on the HTTP server
initSocket(server);

// Middleware
app.use(
  cors({
    origin: [config.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);
app.use(express.json());

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/machines', machineRoutes);
app.use('/api/fleet', fleetRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/operators', operatorRoutes);
app.use('/api/site', siteRoutes);

// 404 Handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl}` });
});

// Basic Error Handling Middleware
app.use((err, req, res, next) => {
  // Handle invalid JSON body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON payload in request' });
  }

  console.error('[Server Error]', err);
  const status = err.status || 500;
  return res.status(status).json({
    error: err.message || 'Internal Server Error',
  });
});

// Start Server
server.listen(config.port, config.host, async () => {
  console.log('====================================================');
  console.log('       CAT SMART OPERATOR - BACKEND SERVICE         ');
  console.log('====================================================');
  console.log(`Server running on: http://${config.host}:${config.port}`);
  console.log(`Local Access:      http://localhost:${config.port}`);
  console.log(`CORS Allowed:      ${config.clientUrl}`);
  console.log('----------------------------------------------------');

  // Seed default machines (EXC001, EXC002, EXC003) if not present
  try {
    await seedInitialMachines();
  } catch (error) {
    console.error('[Startup] Failed to verify/seed initial machines:', error.message);
  }

  // Connect to the MQTT broker and start listening for machine telemetry
  mqttService.init();
});

module.exports = { app, server };

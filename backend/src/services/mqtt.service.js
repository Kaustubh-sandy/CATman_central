const mqtt = require('mqtt');
const config = require('../config/env');
const telemetryStore = require('./telemetryStore.service');
const connectivityService = require('./connectivity.service');
const machineService = require('./machine.service');
const { broadcastTelemetry, broadcastConnectivity } = require('../socket/socket');

let client = null;

function init() {
  connectivityService.setBroadcaster(broadcastConnectivity);
  connectivityService.startMonitor(async () => {
    const machines = await machineService.getAllMachines();
    return machines.map((m) => m.machineId);
  });

  client = mqtt.connect(config.mqttUrl, {
    clientId: `catman-central-${Date.now()}`,
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 5000,
  });

  client.on('connect', () => {
    console.log(`[MQTT] Connected to ${config.mqttUrl}`);
    client.subscribe('machines/+/telemetry', { qos: 0 }, (err) => {
      if (err) {
        console.error('[MQTT] Subscribe failed:', err.message);
      } else {
        console.log('[MQTT] Subscribed to machines/+/telemetry');
      }
    });
  });

  client.on('reconnect', () => {
    console.log('[MQTT] Reconnecting...');
  });

  client.on('error', (error) => {
    console.error('[MQTT] Error:', error.message);
  });

  client.on('close', () => {
    console.log('[MQTT] Connection closed');
  });

  client.on('message', (topic, messageBuffer) => {
    const machineId = topic.split('/')[1];

    let payload;
    try {
      payload = JSON.parse(messageBuffer.toString());
    } catch (error) {
      console.error(`[MQTT] Invalid telemetry JSON on ${topic}:`, error.message);
      return;
    }

    telemetryStore.update(machineId, payload);
    connectivityService.recordSeen(machineId);
    broadcastTelemetry(payload);
  });

  return client;
}

module.exports = { init };

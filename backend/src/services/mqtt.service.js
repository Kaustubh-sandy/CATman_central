const mqtt = require('mqtt');
const config = require('../config/env');
const bus = require('./bus');
const telemetryStore = require('./telemetryStore.service');
const connectivityService = require('./connectivity.service');
const machineService = require('./machine.service');
const { broadcastTelemetry, broadcastConnectivity } = require('../socket/socket');

const SUBSCRIPTIONS = [
  'machines/+/telemetry',
  'machines/+/heartbeat',
  'machines/+/state',
  'machines/+/events',
  'machines/+/precheck/+',
  'site/conditions',
];

let client = null;
let connected = false;

function route(topic, payload) {
  if (topic === 'site/conditions') {
    bus.emit('site', payload);
    return;
  }

  const [, machineId, kind, sub] = topic.split('/');

  switch (kind) {
    case 'telemetry':
      telemetryStore.update(machineId, payload);
      connectivityService.recordSeen(machineId);
      broadcastTelemetry(payload);
      bus.emit('telemetry', machineId, payload);
      break;
    case 'heartbeat':
      connectivityService.recordSeen(machineId);
      bus.emit('heartbeat', machineId, payload);
      break;
    case 'state':
      bus.emit('machineState', machineId, payload);
      break;
    case 'events':
      bus.emit('machineEvent', machineId, payload);
      break;
    case 'precheck':
      if (sub === 'ack') bus.emit('precheckAck', machineId, payload);
      if (sub === 'progress') bus.emit('precheckProgress', machineId, payload);
      if (sub === 'result') bus.emit('precheckResult', machineId, payload);
      break;
    default:
      break;
  }
}

function init() {
  connectivityService.setBroadcaster(broadcastConnectivity);
  connectivityService.startMonitor(async () => machineService.getAllMachines().map((m) => m.machineId));

  client = mqtt.connect(config.mqttUrl, {
    clientId: `catman-central-${Date.now()}`,
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 5000,
  });

  client.on('connect', () => {
    connected = true;
    console.log(`[MQTT] Connected to ${config.mqttUrl}`);
    client.subscribe(SUBSCRIPTIONS, { qos: 1 }, (err) => {
      if (err) console.error('[MQTT] Subscribe failed:', err.message);
      else console.log(`[MQTT] Subscribed to ${SUBSCRIPTIONS.join(', ')}`);
    });
  });

  client.on('reconnect', () => console.log('[MQTT] Reconnecting...'));
  client.on('error', (error) => console.error('[MQTT] Error:', error.message));
  client.on('close', () => {
    connected = false;
  });

  client.on('message', (topic, buffer) => {
    let payload;
    try {
      payload = JSON.parse(buffer.toString());
    } catch (error) {
      console.error(`[MQTT] Invalid JSON on ${topic}:`, error.message);
      return;
    }
    route(topic, payload);
  });

  return client;
}

function publishCommand(machineId, command, payload) {
  if (!client || !connected) {
    const err = new Error('MQTT broker not connected — cannot reach the machine');
    err.status = 503;
    throw err;
  }
  client.publish(`machines/${machineId}/commands/${command}`, JSON.stringify(payload), { qos: 1 });
}

function isConnected() {
  return connected;
}

module.exports = { init, publishCommand, isConnected };

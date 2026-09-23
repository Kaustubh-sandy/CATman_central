// Minimal local MQTT broker for development, so the demo doesn't require a
// separately installed broker like Mosquitto. Not for production use.
const aedes = require('aedes')();
const net = require('net');

const PORT = parseInt(process.env.MQTT_BROKER_PORT, 10) || 1883;

const server = net.createServer(aedes.handle);

server.listen(PORT, () => {
  console.log('====================================================');
  console.log('       CAT SMART OPERATOR - LOCAL MQTT BROKER       ');
  console.log('====================================================');
  console.log(`Listening on mqtt://localhost:${PORT}`);
  console.log('====================================================\n');
});

aedes.on('client', (client) => {
  console.log(`[MQTT Broker] Client connected: ${client.id}`);
});

aedes.on('clientDisconnect', (client) => {
  console.log(`[MQTT Broker] Client disconnected: ${client.id}`);
});

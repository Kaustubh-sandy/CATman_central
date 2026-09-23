const { Server } = require('socket.io');
const config = require('../config/env');

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: [config.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Operator connected: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Operator disconnected: ${socket.id}`);
    });
  });

  return io;
}

function broadcastTelemetry(telemetry) {
  if (io) {
    io.emit('machine:telemetry', telemetry);
  }
}

function broadcastConnectivity(update) {
  if (io) {
    io.emit('machine:connectivity', update);
  }
}

function getIO() {
  return io;
}

module.exports = {
  initSocket,
  broadcastTelemetry,
  broadcastConnectivity,
  getIO,
};

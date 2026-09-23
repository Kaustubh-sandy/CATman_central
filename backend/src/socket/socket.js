const { Server } = require('socket.io');
const config = require('../config/env');

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      ...config.corsOptions,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

// No login yet, so every connected client (operator dashboard, control room)
// receives every event and filters by machine/operator on its side.
function emit(event, payload) {
  if (io) io.emit(event, payload);
}

function broadcastTelemetry(telemetry) {
  emit('machine:telemetry', telemetry);
}

function broadcastConnectivity(update) {
  emit('machine:connectivity', update);
}

module.exports = {
  initSocket,
  emit,
  broadcastTelemetry,
  broadcastConnectivity,
};

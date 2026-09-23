// In-process event bus. MQTT messages are published here and consumed by the
// domain services, so services don't import each other in a circle.
//
// Events: telemetry, heartbeat, machineState, machineEvent, site,
//         precheckAck, precheckProgress, precheckResult
const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(50);

module.exports = bus;

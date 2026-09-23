const bus = require('./bus');
const { emit } = require('../socket/socket');

// Defaults until the first site/conditions message arrives from a simulator.
let conditions = {
  weather: 'CLEAR',
  visibility: 'GOOD',
  ambientTempC: 31,
  source: null,
  timestamp: null,
};

function get() {
  return { ...conditions };
}

function init() {
  bus.on('site', (payload) => {
    conditions = { ...conditions, ...payload };
    emit('site:conditions', conditions);
  });
}

module.exports = { get, init };

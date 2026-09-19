const { TOPICS } = require('../config/mqtt');
const { publish } = require('../mqtt/client');

function buildPayload() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return { time: `${hh}:${mm}` };
}

async function publishClock() {
  await publish(TOPICS.dataClock, buildPayload(), { qos: 0 });
}

module.exports = { publishClock, buildPayload };

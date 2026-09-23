const { TOPICS } = require('../config/mqtt');
const { publish } = require('../mqtt/client');

const TIME_ZONE = 'Europe/Rome';

function buildPayload() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('it-IT', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hh = parts.find((p) => p.type === 'hour').value;
  const mm = parts.find((p) => p.type === 'minute').value;
  return { time: `${hh}:${mm}` };
}

async function publishClock() {
  await publish(TOPICS.dataClock, buildPayload(), { qos: 0 });
}

module.exports = { publishClock, buildPayload };
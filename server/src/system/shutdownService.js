const { TOPICS } = require('../config/mqtt');
const { publish } = require('../mqtt/client');

async function requestShutdown(payload) {
  if (!payload || payload.target !== 'pi') {
    console.error('Payload shutdown non valido o target diverso da pi, ignorato:', payload);
    return;
  }

  // Il backend gira in un container Docker e non ha accesso a sudo sull'host: si limita
  // a notificare il display. L'esecuzione reale di ops/scripts/shutdown.sh e delegata al
  // listener MQTT separato in esecuzione sull'host (ops/scripts/shutdown_listener.sh),
  // che riceve lo stesso evento in parallelo su questo topic (vedi step OPS).
  await publish(TOPICS.dataSystem, { state: 'shutting_down' }, { qos: 1 });
}

module.exports = { requestShutdown };

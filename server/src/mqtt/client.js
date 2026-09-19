const mqtt = require('mqtt');
const { MQTT_URL, MQTT_USER, MQTT_PASSWORD, TOPICS } = require('../config/mqtt');
const { withRetry } = require('../utils/retry');

let client = null;

function parseJsonSafe(rawPayload, handler) {
  try {
    const data = JSON.parse(rawPayload);
    handler(data);
  } catch {
    console.error('Payload JSON non valido, ignorato:', rawPayload);
  }
}

function connectMqtt(handlers) {
  client = mqtt.connect(MQTT_URL, {
    username: MQTT_USER,
    password: MQTT_PASSWORD,
    reconnectPeriod: 2000,
  });

  client.on('connect', () => {
    console.log('MQTT connesso a', MQTT_URL);
    client.subscribe([TOPICS.screenCurrent, TOPICS.eventAll, TOPICS.status], (err) => {
      if (err) {
        console.error('Errore durante la subscribe MQTT', err.message);
      }
    });
  });

  client.on('reconnect', () => {
    console.log('MQTT: tentativo di riconnessione in corso');
  });

  client.on('close', () => {
    console.log('MQTT: connessione chiusa');
  });

  client.on('error', (err) => {
    console.error('Errore MQTT', err.message);
  });

  client.on('message', (topic, payloadBuffer) => {
    const payload = payloadBuffer.toString();

    if (topic === TOPICS.screenCurrent) {
      handlers.onScreenChange(payload);
      return;
    }

    if (topic === TOPICS.status) {
      handlers.onStatus(payload);
      return;
    }

    if (topic === TOPICS.eventSpotifyControl) {
      parseJsonSafe(payload, handlers.onSpotifyControl);
      return;
    }

    if (topic === TOPICS.eventWeatherDaySelect) {
      parseJsonSafe(payload, handlers.onWeatherDaySelect);
      return;
    }

    if (topic === TOPICS.eventSystemShutdown) {
      parseJsonSafe(payload, handlers.onShutdownRequest);
      return;
    }

    if (topic === TOPICS.eventSystemOtaResult) {
      parseJsonSafe(payload, handlers.onOtaResult);
    }
  });

  return client;
}

async function publish(topic, payloadObj, options = {}) {
  if (!client) {
    throw new Error('Client MQTT non ancora connesso');
  }

  const payload = JSON.stringify(payloadObj);

  await withRetry(() => new Promise((resolve, reject) => {
    client.publish(topic, payload, options, (err) => {
      if (err) reject(err);
      else resolve();
    });
  }));
}

function getMqttClient() {
  return client;
}

module.exports = { connectMqtt, publish, getMqttClient };

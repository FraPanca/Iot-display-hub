const express = require('express');
const mongoose = require('mongoose');
const { getRedisClient } = require('../config/redis');
const { getMqttClient } = require('../mqtt/client');

const router = express.Router();

router.get('/health', (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;

  let redisOk = false;
  try {
    redisOk = getRedisClient().isReady;
  } catch {
    redisOk = false;
  }

  const mqttClient = getMqttClient();
  const mqttOk = Boolean(mqttClient && mqttClient.connected);

  const healthy = mongoOk && redisOk && mqttOk;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    dependencies: {
      mongodb: mongoOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
      mqtt: mqttOk ? 'ok' : 'error',
    },
  });
});

module.exports = router;

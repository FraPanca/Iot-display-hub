const { createClient } = require('redis');

let client = null;

async function connectRedis() {
  const { REDIS_HOST, REDIS_PORT } = process.env;

  client = createClient({
    socket: { host: REDIS_HOST, port: Number(REDIS_PORT) },
  });

  client.on('error', (err) => {
    console.error('Errore Redis', err.message);
  });

  await client.connect();
  console.log('Redis connesso');

  return client;
}

function getRedisClient() {
  if (!client) {
    throw new Error('Redis non ancora connesso, chiamare connectRedis prima');
  }
  return client;
}

module.exports = { connectRedis, getRedisClient };

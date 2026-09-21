jest.mock('../../src/config/redis');
jest.mock('../../src/mqtt/client');

const request = require('supertest');
const mongoose = require('mongoose');
const { getRedisClient } = require('../../src/config/redis');
const { getMqttClient } = require('../../src/mqtt/client');
const app = require('../../src/app');

function setDependencies({ mongo = true, redis = true, mqtt = true } = {}) {
  jest.spyOn(mongoose, 'connection', 'get').mockReturnValue({ readyState: mongo ? 1 : 0 });

  if (redis === 'throws') {
    getRedisClient.mockImplementation(() => {
      throw new Error('Redis non ancora connesso');
    });
  } else {
    getRedisClient.mockReturnValue({ isReady: redis });
  }

  if (mqtt === 'none') getMqttClient.mockReturnValue(null);
  else getMqttClient.mockReturnValue({ connected: mqtt });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/health', () => {
  it('risponde 200 quando tutte le dipendenze sono sane', async () => {
    setDependencies();

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      dependencies: { mongodb: 'ok', redis: 'ok', mqtt: 'ok' },
    });
  });

  it.each([
    ['mongodb', { mongo: false }],
    ['redis', { redis: false }],
    ['mqtt', { mqtt: false }],
  ])('risponde 503 e segnala %s se non e disponibile', async (dependency, overrides) => {
    setDependencies(overrides);

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.dependencies[dependency]).toBe('error');
    Object.keys(res.body.dependencies)
      .filter((name) => name !== dependency)
      .forEach((name) => expect(res.body.dependencies[name]).toBe('ok'));
  });

  it('risponde 503 se Redis non e ancora stato inizializzato', async () => {
    setDependencies({ redis: 'throws' });

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.dependencies.redis).toBe('error');
  });

  it('risponde 503 se il client MQTT non esiste ancora', async () => {
    setDependencies({ mqtt: 'none' });

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.dependencies.mqtt).toBe('error');
  });

  it('risponde 503 con tutte le dipendenze giu', async () => {
    setDependencies({ mongo: false, redis: false, mqtt: false });

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(Object.values(res.body.dependencies)).toEqual(['error', 'error', 'error']);
  });
});

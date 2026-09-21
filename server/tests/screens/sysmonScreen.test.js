const os = require('os');
const { silenceConsole } = require('../helpers/silenceConsole');

silenceConsole();

// Valori che load() produce di default: cpu 50%, mem 40%, disco 55%, temp 48.3, tutti i servizi ok
const BASE = {
  cpu_percent: 50,
  mem_percent: 40,
  disk_percent: 55,
  temp_c: 48.3,
  services: [
    { name: 'mongodb', status: 'ok' },
    { name: 'redis', status: 'ok' },
    { name: 'mosquitto', status: 'ok' },
  ],
};

function load({
  df = '55%\n',
  temp = '48300\n',
  mongo = 'ok',
  redisReady = true,
  redisThrows = false,
  mqtt = 'connected',
  previous = null,
  cpuIdle = false,
  stateful = false,
} = {}) {
  jest.resetModules();

  // Ogni lettura avanza di 100 tick sia user sia idle: delta cpu costante al 50%
  let step = 0;
  jest.spyOn(os, 'cpus').mockImplementation(() => {
    const ticks = cpuIdle ? 0 : step++ * 100;
    return [{ times: { user: ticks, nice: 0, sys: 0, idle: ticks, irq: 0 } }];
  });
  jest.spyOn(os, 'totalmem').mockReturnValue(1000);
  jest.spyOn(os, 'freemem').mockReturnValue(600);

  jest.doMock('child_process', () => ({
    exec: jest.fn((cmd, callback) => {
      const output = cmd.startsWith('df') ? df : temp;
      if (output === null) callback(new Error('comando fallito'));
      else callback(null, { stdout: output });
    }),
  }));

  const publish = jest.fn().mockResolvedValue();
  const mqttClient = mqtt === 'none' ? null : { connected: mqtt === 'connected' };
  jest.doMock('../../src/mqtt/client', () => ({ publish, getMqttClient: () => mqttClient }));

  // Con stateful il finto Redis conserva cio che viene scritto, come farebbe quello vero
  const store = new Map();
  const redis = {
    isReady: redisReady,
    get: jest.fn(async (key) => {
      if (stateful) return store.get(key) || null;
      return previous ? JSON.stringify(previous) : null;
    }),
    set: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
  };
  jest.doMock('../../src/config/redis', () => ({
    getRedisClient: () => {
      if (redisThrows) throw new Error('Redis non ancora connesso');
      return redis;
    },
  }));
  jest.doMock('../../src/config/db', () => ({ getMongoStatus: () => mongo }));

  const { publishSysmon } = require('../../src/screens/sysmonScreen');
  const { TOPICS } = require('../../src/config/mqtt');
  return { publishSysmon, publish, redis, store, TOPICS };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('publishSysmon, contenuto del payload', () => {
  it('alla prima pubblicazione invia le metriche su data/sysmon con QoS 0', async () => {
    const { publishSysmon, publish, redis, TOPICS } = load();

    await publishSysmon();

    expect(publish).toHaveBeenCalledWith(TOPICS.dataSysmon, BASE, { qos: 0 });
    expect(redis.set).toHaveBeenCalledWith('sysmon:last', JSON.stringify(BASE));
  });

  it('rispetta lo schema di C-mqtt-topics-and-apis', async () => {
    const { publishSysmon, publish } = load();

    await publishSysmon();

    const payload = publish.mock.calls[0][1];
    expect(Object.keys(payload).sort()).toEqual(['cpu_percent', 'disk_percent', 'mem_percent', 'services', 'temp_c']);
    payload.services.forEach((service) => {
      expect(['ok', 'warning', 'error']).toContain(service.status);
    });
  });

  it('segnala error per i servizi non raggiungibili', async () => {
    const { publishSysmon, publish } = load({ mongo: 'error', redisReady: false, mqtt: 'disconnected' });

    await publishSysmon();

    expect(publish.mock.calls[0][1].services).toEqual([
      { name: 'mongodb', status: 'error' },
      { name: 'redis', status: 'error' },
      { name: 'mosquitto', status: 'error' },
    ]);
  });

  it('segnala mosquitto in error se il client MQTT non esiste ancora', async () => {
    const { publishSysmon, publish } = load({ mqtt: 'none' });

    await publishSysmon();

    expect(publish.mock.calls[0][1].services[2]).toEqual({ name: 'mosquitto', status: 'error' });
  });

  it('propaga l\'errore se Redis non e ancora inizializzato', async () => {
    const { publishSysmon, publish } = load({ redisThrows: true });

    await expect(publishSysmon()).rejects.toThrow('Redis non ancora connesso');
    expect(publish).not.toHaveBeenCalled();
  });

  it('ritorna 0% di cpu se i contatori non sono avanzati', async () => {
    const { publishSysmon, publish } = load({ cpuIdle: true });

    await publishSysmon();

    expect(publish.mock.calls[0][1].cpu_percent).toBe(0);
  });

  it('usa null per disco e temperatura se la lettura fallisce', async () => {
    const { publishSysmon, publish } = load({ df: null, temp: null });

    await publishSysmon();

    const payload = publish.mock.calls[0][1];
    expect(payload.disk_percent).toBeNull();
    expect(payload.temp_c).toBeNull();
  });
});

describe('publishSysmon, deduplica', () => {
  it('non pubblica ne aggiorna Redis se nulla e cambiato', async () => {
    const { publishSysmon, publish, redis } = load({ previous: BASE });

    await publishSysmon();

    expect(publish).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it.each([
    ['cpu, variazione sotto soglia (4.9)', { cpu_percent: 45.1 }, false],
    ['cpu, variazione a soglia (5)', { cpu_percent: 45 }, true],
    ['memoria, variazione sotto soglia (4.9)', { mem_percent: 35.1 }, false],
    ['memoria, variazione a soglia (5)', { mem_percent: 35 }, true],
    ['temperatura, variazione sotto soglia (1.8)', { temp_c: 46.5 }, false],
    ['temperatura, variazione sopra soglia (2.3)', { temp_c: 46 }, true],
    ['disco, qualsiasi variazione', { disk_percent: 54 }, true],
    ['servizi, cambio di stato', { services: [{ name: 'mongodb', status: 'ok' }, { name: 'redis', status: 'error' }, { name: 'mosquitto', status: 'ok' }] }, true],
  ])('%s', async (_label, changes, shouldPublish) => {
    const { publishSysmon, publish, redis } = load({ previous: { ...BASE, ...changes } });

    await publishSysmon();

    expect(publish).toHaveBeenCalledTimes(shouldPublish ? 1 : 0);
    expect(redis.set).toHaveBeenCalledTimes(shouldPublish ? 1 : 0);
  });

  it('ignora la temperatura nel confronto se non disponibile', async () => {
    const { publishSysmon, publish } = load({ temp: null, previous: BASE });

    await publishSysmon();

    expect(publish).not.toHaveBeenCalled();
  });

  it('pubblica se un servizio cambia stato anche con metriche identiche', async () => {
    const { publishSysmon, publish } = load({ mongo: 'error', previous: BASE });

    await publishSysmon();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][1].services[0]).toEqual({ name: 'mongodb', status: 'error' });
  });
});

describe('publishSysmon, publish fallita', () => {
  it('dopo una pubblicazione fallita ripubblica gli stessi valori al tick successivo', async () => {
    const { publishSysmon, publish } = load({ stateful: true });
    publish.mockRejectedValueOnce(new Error('broker giu'));

    await expect(publishSysmon()).rejects.toThrow('broker giu');
    await publishSysmon();

    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1][1]).toEqual(BASE);
  });

  it('non memorizza in cache un payload la cui pubblicazione e fallita', async () => {
    const { publishSysmon, publish, store } = load({ stateful: true });
    publish.mockRejectedValueOnce(new Error('broker giu'));

    await expect(publishSysmon()).rejects.toThrow('broker giu');

    expect(store.has('sysmon:last')).toBe(false);
  });

  it('dopo la pubblicazione riuscita non ripubblica valori invariati', async () => {
    const { publishSysmon, publish } = load({ stateful: true });

    await publishSysmon();
    await publishSysmon();

    expect(publish).toHaveBeenCalledTimes(1);
  });
});
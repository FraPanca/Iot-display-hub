const net = require('net');
const aedes = require('aedes');
const mqtt = require('mqtt');
const { silenceConsole } = require('../helpers/silenceConsole');

const PREFIX = 'display/cyd-01';
const USERS = { 'display-server': 'server-secret', 'display-esp32': 'esp32-secret' };

const ctx = {};

async function waitFor(predicate, timeoutMs = 3000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timeout in attesa della condizione');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function startBroker(port = 0) {
  ctx.subscriptions = [];
  ctx.sockets = new Set();
  ctx.authAttempts = [];

  ctx.broker = aedes();

  ctx.broker.authenticate = (client, username, password, callback) => {
    const user = username || '';
    ctx.authAttempts.push(user);
    const ok = USERS[user] !== undefined && USERS[user] === String(password || '');
    if (ok) {
      callback(null, true);
      return;
    }
    const error = new Error('Bad username or password');
    error.returnCode = 4;
    callback(error, false);
  };

  ctx.broker.on('subscribe', (subscriptions) => {
    subscriptions.forEach((sub) => ctx.subscriptions.push(sub.topic));
  });

  ctx.server = net.createServer(ctx.broker.handle);
  ctx.server.on('connection', (socket) => {
    ctx.sockets.add(socket);
    socket.on('close', () => ctx.sockets.delete(socket));
  });

  return new Promise((resolve) => {
    ctx.server.listen(port, '127.0.0.1', () => {
      ctx.port = ctx.server.address().port;
      resolve();
    });
  });
}

async function stopBroker() {
  ctx.sockets.forEach((socket) => socket.destroy());
  await new Promise((resolve) => ctx.server.close(resolve));
  await new Promise((resolve) => ctx.broker.close(resolve));
}

// Carica mqtt/client.js da zero, puntato al broker di test
function loadServerModule({ password = USERS['display-server'] } = {}) {
  jest.resetModules();
  process.env.MQTT_HOST = '127.0.0.1';
  process.env.MQTT_PORT = String(ctx.port);
  process.env.MQTT_USER = 'display-server';
  process.env.MQTT_PASSWORD = password;
  process.env.DISPLAY_ID = 'cyd-01';

  ctx.serverModule = require('../../src/mqtt/client');
  return ctx.serverModule;
}

function makeHandlers() {
  return {
    onScreenChange: jest.fn(),
    onStatus: jest.fn(),
    onSpotifyControl: jest.fn(),
    onWeatherDaySelect: jest.fn(),
    onShutdownRequest: jest.fn(),
    onOtaResult: jest.fn(),
  };
}

async function connectServer(handlers = makeHandlers(), options = {}) {
  const module = loadServerModule(options);
  module.connectMqtt(handlers);
  await waitFor(() => ctx.subscriptions.length >= 3);
  return { module, handlers };
}

// Simula l'ESP32: si sottoscrive a data/# e raccoglie i messaggi ricevuti
async function connectEsp32({ subscribe = true } = {}) {
  const received = [];
  const client = mqtt.connect(`mqtt://127.0.0.1:${ctx.port}`, {
    username: 'display-esp32',
    password: USERS['display-esp32'],
    reconnectPeriod: 0,
  });
  ctx.esp32Clients.push(client);

  client.on('message', (topic, payload, packet) => {
    received.push({ topic, payload: payload.toString(), qos: packet.qos, retain: packet.retain });
  });

  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('error', reject);
  });

  if (subscribe) {
    await new Promise((resolve, reject) => {
      client.subscribe(`${PREFIX}/data/#`, { qos: 1 }, (err) => (err ? reject(err) : resolve()));
    });
  }

  return { client, received };
}

function esp32Publish(client, topic, payload, options = {}) {
  return new Promise((resolve, reject) => {
    client.publish(topic, payload, { qos: 1, ...options }, (err) => (err ? reject(err) : resolve()));
  });
}

beforeEach(async () => {
  ctx.esp32Clients = [];
  ctx.serverModule = null;
  await startBroker();
});

afterEach(async () => {
  const serverClient = ctx.serverModule && ctx.serverModule.getMqttClient();
  if (serverClient) serverClient.end(true);
  ctx.esp32Clients.forEach((client) => client.end(true));
  await stopBroker();
});

// Registrato dopo i miei hook: il ripristino della console deve avvenire per ultimo
silenceConsole();

describe('connessione e autenticazione', () => {
  it('si connette con le credenziali display-server', async () => {
    const { module } = await connectServer();

    expect(module.getMqttClient().connected).toBe(true);
    expect(ctx.authAttempts).toContain('display-server');
  });

  it('con credenziali errate non risulta connesso e logga l\'errore', async () => {
    const module = loadServerModule({ password: 'sbagliata' });
    module.connectMqtt(makeHandlers());

    await waitFor(() => console.error.mock.calls.some(([label]) => label === 'Errore MQTT'));

    expect(module.getMqttClient().connected).toBe(false);
    expect(ctx.subscriptions).toHaveLength(0);
  });

  it('si sottoscrive a screen/current, event/# e status', async () => {
    await connectServer();

    expect(ctx.subscriptions.sort()).toEqual([
      `${PREFIX}/event/#`,
      `${PREFIX}/screen/current`,
      `${PREFIX}/status`,
    ]);
  });

  it('non si sottoscrive ai topic data/# che pubblica lui stesso', async () => {
    await connectServer();

    expect(ctx.subscriptions.some((topic) => topic.includes('/data/'))).toBe(false);
  });
});

describe('dispatch dei messaggi in arrivo', () => {
  it('passa il valore grezzo di screen/current a onScreenChange', async () => {
    const { handlers } = await connectServer();
    const { client } = await connectEsp32();

    await esp32Publish(client, `${PREFIX}/screen/current`, 'weather', { retain: true });

    await waitFor(() => handlers.onScreenChange.mock.calls.length > 0);
    expect(handlers.onScreenChange).toHaveBeenCalledWith('weather');
  });

  it('gestisce il valore off su screen/current', async () => {
    const { handlers } = await connectServer();
    const { client } = await connectEsp32();

    await esp32Publish(client, `${PREFIX}/screen/current`, 'off');

    await waitFor(() => handlers.onScreenChange.mock.calls.length > 0);
    expect(handlers.onScreenChange).toHaveBeenCalledWith('off');
  });

  it('passa lo stato del display a onStatus', async () => {
    const { handlers } = await connectServer();
    const { client } = await connectEsp32();

    await esp32Publish(client, `${PREFIX}/status`, 'online', { retain: true });

    await waitFor(() => handlers.onStatus.mock.calls.length > 0);
    expect(handlers.onStatus).toHaveBeenCalledWith('online');
  });

  it.each([
    ['event/spotify/control', 'onSpotifyControl', { action: 'play_pause' }],
    ['event/weather/day_select', 'onWeatherDaySelect', { day_index: 2 }],
    ['event/system/shutdown', 'onShutdownRequest', { target: 'pi' }],
    ['event/system/ota_result', 'onOtaResult', { status: 'success', version: 'v1.4.0' }],
  ])('%s viene parsato e passato a %s', async (topicSuffix, handlerName, payload) => {
    const { handlers } = await connectServer();
    const { client } = await connectEsp32();

    await esp32Publish(client, `${PREFIX}/${topicSuffix}`, JSON.stringify(payload));

    await waitFor(() => handlers[handlerName].mock.calls.length > 0);
    expect(handlers[handlerName]).toHaveBeenCalledWith(payload);
  });

  it('ignora un JSON malformato senza chiamare l\'handler e continua a funzionare', async () => {
    const { handlers } = await connectServer();
    const { client } = await connectEsp32();

    await esp32Publish(client, `${PREFIX}/event/spotify/control`, '{non valido');
    await esp32Publish(client, `${PREFIX}/event/spotify/control`, JSON.stringify({ action: 'next' }));

    await waitFor(() => handlers.onSpotifyControl.mock.calls.length > 0);
    expect(handlers.onSpotifyControl).toHaveBeenCalledTimes(1);
    expect(handlers.onSpotifyControl).toHaveBeenCalledWith({ action: 'next' });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('JSON non valido'), '{non valido');
  });

  it('ignora un evento su un topic non gestito', async () => {
    const { handlers } = await connectServer();
    const { client } = await connectEsp32();

    await esp32Publish(client, `${PREFIX}/event/sconosciuto/altro`, JSON.stringify({ a: 1 }));
    await esp32Publish(client, `${PREFIX}/screen/current`, 'clock');

    await waitFor(() => handlers.onScreenChange.mock.calls.length > 0);
    Object.entries(handlers).forEach(([name, handler]) => {
      if (name !== 'onScreenChange') expect(handler).not.toHaveBeenCalled();
    });
  });
});

describe('publish', () => {
  it('rifiuta la pubblicazione se il client non e stato creato', async () => {
    jest.resetModules();
    const { publish } = require('../../src/mqtt/client');

    await expect(publish(`${PREFIX}/data/clock`, { time: '10:00' })).rejects.toThrow('Client MQTT non ancora connesso');
  });

  it('serializza il payload in JSON sul topic indicato', async () => {
    const { module } = await connectServer();
    const { received } = await connectEsp32();

    await module.publish(`${PREFIX}/data/quote`, { text: 'La frase del momento.' }, { qos: 1 });

    await waitFor(() => received.length > 0);
    expect(received[0].topic).toBe(`${PREFIX}/data/quote`);
    expect(JSON.parse(received[0].payload)).toEqual({ text: 'La frase del momento.' });
  });

  it('data/clock arriva al display nel formato HH:mm con QoS 0', async () => {
    await connectServer();
    const { received } = await connectEsp32();
    const { publishClock } = require('../../src/screens/clockScreen');

    await publishClock();

    await waitFor(() => received.length > 0);
    expect(received[0].topic).toBe(`${PREFIX}/data/clock`);
    expect(JSON.parse(received[0].payload)).toEqual({ time: expect.stringMatching(/^\d{2}:\d{2}$/) });
    expect(received[0].qos).toBe(0);
  });

  it('l\'ack di shutdown arriva su data/system con QoS 1', async () => {
    await connectServer();
    const { received } = await connectEsp32();
    const { requestShutdown } = require('../../src/system/shutdownService');

    await requestShutdown({ target: 'pi' });

    await waitFor(() => received.length > 0);
    expect(received[0].topic).toBe(`${PREFIX}/data/system`);
    expect(JSON.parse(received[0].payload)).toEqual({ state: 'shutting_down' });
    expect(received[0].qos).toBe(1);
  });

  it('data/firmware retained viene consegnato a un display che si connette dopo', async () => {
    const { module } = await connectServer();
    const payload = { version: 'v1.4.0', checksum_md5: 'd41d8cd98f00b204e9800998ecf8427e' };

    await module.publish(`${PREFIX}/data/firmware`, payload, { qos: 1, retain: true });
    const { received } = await connectEsp32();

    await waitFor(() => received.length > 0);
    expect(received[0].topic).toBe(`${PREFIX}/data/firmware`);
    expect(received[0].retain).toBe(true);
    expect(JSON.parse(received[0].payload)).toEqual(payload);
  });

  it('un messaggio non retained non viene consegnato a chi si connette dopo', async () => {
    const { module } = await connectServer();

    await module.publish(`${PREFIX}/data/quote`, { text: 'Frase' }, { qos: 1 });
    const { received } = await connectEsp32();
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(received).toHaveLength(0);
  });
});

describe('riconnessione al broker', () => {
  it('si riconnette e ripete la subscribe dopo la caduta del broker', async () => {
    const { module, handlers } = await connectServer();
    const port = ctx.port;

    await stopBroker();
    await waitFor(() => module.getMqttClient().connected === false);
    await startBroker(port);

    await waitFor(() => ctx.subscriptions.length >= 3, 10000);
    expect(module.getMqttClient().connected).toBe(true);

    const { client } = await connectEsp32();
    await esp32Publish(client, `${PREFIX}/screen/current`, 'sysmon');

    await waitFor(() => handlers.onScreenChange.mock.calls.length > 0);
    expect(handlers.onScreenChange).toHaveBeenCalledWith('sysmon');
  }, 20000);
});

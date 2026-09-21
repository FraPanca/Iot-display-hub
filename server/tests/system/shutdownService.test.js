jest.mock('../../src/mqtt/client', () => ({ publish: jest.fn().mockResolvedValue() }));
jest.mock('child_process');

const childProcess = require('child_process');
const { publish } = require('../../src/mqtt/client');
const { TOPICS } = require('../../src/config/mqtt');
const { requestShutdown } = require('../../src/system/shutdownService');
const { silenceConsole } = require('../helpers/silenceConsole');

silenceConsole();

describe('requestShutdown', () => {
  it('pubblica l\'ack shutting_down su data/system con QoS 1', async () => {
    await requestShutdown({ target: 'pi' });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(TOPICS.dataSystem, { state: 'shutting_down' }, { qos: 1 });
  });

  it.each([
    ['payload nullo', null],
    ['payload undefined', undefined],
    ['payload vuoto', {}],
    ['target diverso da pi', { target: 'display' }],
    ['target con maiuscole', { target: 'PI' }],
  ])('ignora %s senza pubblicare', async (_label, payload) => {
    await requestShutdown(payload);

    expect(publish).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('non esegue mai processi esterni, il backend containerizzato non ha sudo', async () => {
    await requestShutdown({ target: 'pi' });

    ['exec', 'execFile', 'execSync', 'spawn', 'spawnSync', 'fork'].forEach((fn) => {
      expect(childProcess[fn]).not.toHaveBeenCalled();
    });
  });
});

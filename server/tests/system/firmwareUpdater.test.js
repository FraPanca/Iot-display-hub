const crypto = require('crypto');
const { silenceConsole } = require('../helpers/silenceConsole');

silenceConsole();

const FIRMWARE = Buffer.from('contenuto-finto-del-firmware');
const FIRMWARE_MD5 = crypto.createHash('md5').update(FIRMWARE).digest('hex');

function load() {
  jest.resetModules();

  const fs = { existsSync: jest.fn().mockReturnValue(false), mkdirSync: jest.fn(), writeFileSync: jest.fn() };
  const publish = jest.fn().mockResolvedValue();
  const github = { getLatestFirmwareRelease: jest.fn() };

  jest.doMock('fs', () => fs);
  jest.doMock('../../src/mqtt/client', () => ({ publish }));
  jest.doMock('../../src/integrations/githubReleasesClient', () => github);
  jest.doMock('../../src/utils/retry', () => ({ withRetry: jest.fn((fn) => fn()) }));

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => FIRMWARE.buffer.slice(FIRMWARE.byteOffset, FIRMWARE.byteOffset + FIRMWARE.byteLength),
  });

  const updater = require('../../src/system/firmwareUpdater');
  const { TOPICS } = require('../../src/config/mqtt');
  return { ...updater, fs, publish, github, TOPICS };
}

function release(version) {
  return { version, downloadUrl: `https://example.test/${version}/firmware.bin` };
}

// Svuota le catene di promise lasciate in sospeso da checkForUpdate, chiamata senza await
async function flush() {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  delete global.fetch;
});

describe('startFirmwareUpdater', () => {
  it('controlla subito la release e pubblica versione e checksum MD5 retained con QoS 1', async () => {
    const { startFirmwareUpdater, github, publish, TOPICS } = load();
    github.getLatestFirmwareRelease.mockResolvedValue(release('v1.4.0'));

    startFirmwareUpdater();
    await flush();

    expect(publish).toHaveBeenCalledWith(
      TOPICS.dataFirmware,
      { version: 'v1.4.0', checksum_md5: FIRMWARE_MD5 },
      { qos: 1, retain: true },
    );
  });

  it('scarica il binario dall\'URL della release e lo salva in cache locale', async () => {
    const { startFirmwareUpdater, github, fs, getCachedFirmwarePath } = load();
    github.getLatestFirmwareRelease.mockResolvedValue(release('v1.4.0'));

    startFirmwareUpdater();
    await flush();

    expect(global.fetch).toHaveBeenCalledWith('https://example.test/v1.4.0/firmware.bin');
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(getCachedFirmwarePath(), FIRMWARE);
  });

  it('non ricrea la cartella di cache se esiste gia', async () => {
    const { startFirmwareUpdater, github, fs } = load();
    fs.existsSync.mockReturnValue(true);
    github.getLatestFirmwareRelease.mockResolvedValue(release('v1.4.0'));

    startFirmwareUpdater();
    await flush();

    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('aggiorna la versione corrente dopo la pubblicazione', async () => {
    const { startFirmwareUpdater, github, getCurrentVersion } = load();
    github.getLatestFirmwareRelease.mockResolvedValue(release('v1.4.0'));
    expect(getCurrentVersion()).toBeNull();

    startFirmwareUpdater();
    await flush();

    expect(getCurrentVersion()).toBe('v1.4.0');
  });

  it('ricontrolla ogni 6 ore e non riscarica se la versione non e cambiata', async () => {
    const { startFirmwareUpdater, github, publish } = load();
    github.getLatestFirmwareRelease.mockResolvedValue(release('v1.4.0'));
    startFirmwareUpdater();
    await flush();

    await jest.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    await flush();

    expect(github.getLatestFirmwareRelease).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('non ricontrolla prima di 6 ore', async () => {
    const { startFirmwareUpdater, github } = load();
    github.getLatestFirmwareRelease.mockResolvedValue(release('v1.4.0'));
    startFirmwareUpdater();
    await flush();

    await jest.advanceTimersByTimeAsync(6 * 60 * 60 * 1000 - 1);

    expect(github.getLatestFirmwareRelease).toHaveBeenCalledTimes(1);
  });

  it('scarica e ripubblica quando compare una nuova versione', async () => {
    const { startFirmwareUpdater, github, publish } = load();
    github.getLatestFirmwareRelease.mockResolvedValue(release('v1.4.0'));
    startFirmwareUpdater();
    await flush();

    github.getLatestFirmwareRelease.mockResolvedValue(release('v1.5.0'));
    await jest.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    await flush();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1][1].version).toBe('v1.5.0');
  });
});

describe('gestione errori', () => {
  it('se GitHub non risponde logga l\'errore senza pubblicare ne lanciare', async () => {
    const { startFirmwareUpdater, github, publish } = load();
    github.getLatestFirmwareRelease.mockRejectedValue(new Error('GitHub Releases risposta non ok: 500'));

    expect(() => startFirmwareUpdater()).not.toThrow();
    await flush();

    expect(publish).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('se il download fallisce non aggiorna la versione, cosi al prossimo giro riprova', async () => {
    const { startFirmwareUpdater, github, publish, getCurrentVersion } = load();
    github.getLatestFirmwareRelease.mockResolvedValue(release('v1.4.0'));
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404 });

    startFirmwareUpdater();
    await flush();

    expect(publish).not.toHaveBeenCalled();
    expect(getCurrentVersion()).toBeNull();

    await jest.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    await flush();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(getCurrentVersion()).toBe('v1.4.0');
  });

  it('se la pubblicazione MQTT fallisce logga l\'errore, non lancia e non aggiorna la versione', async () => {
    const { startFirmwareUpdater, github, publish, getCurrentVersion } = load();
    github.getLatestFirmwareRelease.mockResolvedValue(release('v1.4.0'));
    publish.mockRejectedValueOnce(new Error('broker giu'));

    expect(() => startFirmwareUpdater()).not.toThrow();
    await flush();

    expect(console.error).toHaveBeenCalled();
    expect(getCurrentVersion()).toBeNull();
  });

  it('dopo una pubblicazione MQTT fallita ritenta l\'intero flusso al controllo successivo', async () => {
    const { startFirmwareUpdater, github, publish, getCurrentVersion, TOPICS } = load();
    github.getLatestFirmwareRelease.mockResolvedValue(release('v1.4.0'));
    publish.mockRejectedValueOnce(new Error('broker giu'));

    startFirmwareUpdater();
    await flush();
    await jest.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    await flush();

    expect(github.getLatestFirmwareRelease).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith(
      TOPICS.dataFirmware,
      { version: 'v1.4.0', checksum_md5: FIRMWARE_MD5 },
      { qos: 1, retain: true },
    );
    expect(getCurrentVersion()).toBe('v1.4.0');
  });

  it('dopo il retry riuscito non ripubblica ai controlli successivi', async () => {
    const { startFirmwareUpdater, github, publish } = load();
    github.getLatestFirmwareRelease.mockResolvedValue(release('v1.4.0'));
    publish.mockRejectedValueOnce(new Error('broker giu'));

    startFirmwareUpdater();
    await flush();
    await jest.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    await flush();
    await jest.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    await flush();

    expect(publish).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('getCachedFirmwarePath', () => {
  it('punta a firmware-cache/firmware.bin', () => {
    const { getCachedFirmwarePath } = load();

    expect(getCachedFirmwarePath()).toMatch(/firmware-cache[\\/]firmware\.bin$/);
  });
});

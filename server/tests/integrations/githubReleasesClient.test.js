jest.mock('../../src/utils/retry', () => ({ withRetry: jest.fn((fn) => fn()) }));

const { getLatestFirmwareRelease } = require('../../src/integrations/githubReleasesClient');

describe('getLatestFirmwareRelease', () => {
  afterEach(() => {
    delete global.fetch;
  });

  it('ritorna versione e URL dell\'asset firmware.bin', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.4.0',
        assets: [
          { name: 'firmware.md5', browser_download_url: 'https://example.test/firmware.md5' },
          { name: 'firmware.bin', browser_download_url: 'https://example.test/firmware.bin' },
        ],
      }),
    });

    await expect(getLatestFirmwareRelease()).resolves.toEqual({
      version: 'v1.4.0',
      downloadUrl: 'https://example.test/firmware.bin',
    });
  });

  it('interroga l\'endpoint latest del repository con uno User-Agent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: 'v1.0.0', assets: [{ name: 'firmware.bin', browser_download_url: 'u' }] }),
    });

    await getLatestFirmwareRelease();

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/FraPanca/iot-display-hub/releases/latest');
    expect(options.headers['User-Agent']).toBeTruthy();
  });

  it('lancia un errore se la release non ha l\'asset firmware.bin', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: 'v1.0.0', assets: [{ name: 'altro.bin', browser_download_url: 'u' }] }),
    });

    await expect(getLatestFirmwareRelease()).rejects.toThrow('firmware.bin');
  });

  it('gestisce una release senza lista assets', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ tag_name: 'v1.0.0' }) });

    await expect(getLatestFirmwareRelease()).rejects.toThrow('firmware.bin');
  });

  it('propaga l\'errore se GitHub risponde con uno status non ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });

    await expect(getLatestFirmwareRelease()).rejects.toThrow('403');
  });
});

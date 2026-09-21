jest.mock('../../src/system/firmwareUpdater', () => ({
  getCachedFirmwarePath: jest.fn(),
  startFirmwareUpdater: jest.fn(),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { getCachedFirmwarePath } = require('../../src/system/firmwareUpdater');
const app = require('../../src/app');

describe('GET /api/firmware/binary', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('risponde 404 se nessun binario e stato ancora scaricato', async () => {
    getCachedFirmwarePath.mockReturnValue(path.join(tmpDir, 'firmware.bin'));

    const res = await request(app).get('/api/firmware/binary');

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('restituisce il binario in cache byte per byte', async () => {
    const filePath = path.join(tmpDir, 'firmware.bin');
    const content = Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 256));
    fs.writeFileSync(filePath, content);
    getCachedFirmwarePath.mockReturnValue(filePath);

    const res = await request(app).get('/api/firmware/binary');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/octet-stream/);
    expect(Buffer.compare(res.body, content)).toBe(0);
  });
});

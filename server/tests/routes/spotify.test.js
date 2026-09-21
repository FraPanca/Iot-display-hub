jest.mock('../../src/integrations/spotifyClient');

const request = require('supertest');
const sharp = require('sharp');
const { getCoverUrl, exchangeCodeForTokens } = require('../../src/integrations/spotifyClient');
const { COVER_SIZE } = require('../../src/utils/imageConverter');
const app = require('../../src/app');
const { silenceConsole } = require('../helpers/silenceConsole');

silenceConsole();

async function redJpeg() {
  return sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .jpeg({ quality: 100 })
    .toBuffer();
}

function imageResponse(buffer, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}

describe('GET /api/spotify/cover', () => {
  afterEach(() => {
    delete global.fetch;
  });

  it('risponde 400 se manca track_id', async () => {
    const res = await request(app).get('/api/spotify/cover');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/track_id/);
    expect(getCoverUrl).not.toHaveBeenCalled();
  });

  it('risponde 404 se il brano in riproduzione non corrisponde al track_id', async () => {
    getCoverUrl.mockResolvedValue(null);

    const res = await request(app).get('/api/spotify/cover').query({ track_id: 'vecchio' });

    expect(res.status).toBe(404);
  });

  it('restituisce il bitmap RGB565 della copertina per un track_id noto', async () => {
    getCoverUrl.mockResolvedValue('https://img.test/cover.jpg');
    global.fetch = jest.fn().mockResolvedValue(imageResponse(await redJpeg()));

    const res = await request(app).get('/api/spotify/cover').query({ track_id: 'track-1' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/octet-stream/);
    expect(getCoverUrl).toHaveBeenCalledWith('track-1');
    expect(global.fetch).toHaveBeenCalledWith('https://img.test/cover.jpg');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBe(COVER_SIZE * COVER_SIZE * 2);
    expect(res.body.readUInt16LE(0)).toBe(0xf800);
  });

  it('risponde 502 se il download dell\'immagine da Spotify fallisce', async () => {
    getCoverUrl.mockResolvedValue('https://img.test/cover.jpg');
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });

    const res = await request(app).get('/api/spotify/cover').query({ track_id: 'track-1' });

    expect(res.status).toBe(502);
  });

  it('risponde 500 se l\'immagine scaricata non e convertibile', async () => {
    getCoverUrl.mockResolvedValue('https://img.test/cover.jpg');
    global.fetch = jest.fn().mockResolvedValue(imageResponse(Buffer.from('non sono un jpeg')));

    const res = await request(app).get('/api/spotify/cover').query({ track_id: 'track-1' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it('risponde 500 se la lettura dello stato Spotify fallisce', async () => {
    getCoverUrl.mockRejectedValue(new Error('Lettura stato Spotify fallita: 500'));

    const res = await request(app).get('/api/spotify/cover').query({ track_id: 'track-1' });

    expect(res.status).toBe(500);
  });
});

describe('GET /api/spotify/callback', () => {
  it('risponde 400 se manca il code', async () => {
    const res = await request(app).get('/api/spotify/callback');

    expect(res.status).toBe(400);
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it('con un code valido scambia i token e risponde 200 senza esporre il refresh token', async () => {
    exchangeCodeForTokens.mockResolvedValue({ access_token: 'acc', refresh_token: 'REFRESH-SEGRETO' });

    const res = await request(app).get('/api/spotify/callback').query({ code: 'codice-valido' });

    expect(res.status).toBe(200);
    expect(exchangeCodeForTokens).toHaveBeenCalledWith('codice-valido', expect.stringMatching(/\/api\/spotify\/callback$/));
    expect(res.text).not.toContain('REFRESH-SEGRETO');
    expect(console.log).toHaveBeenCalledWith('REFRESH-SEGRETO');
  });

  it('risponde 400 se lo scambio del code fallisce', async () => {
    exchangeCodeForTokens.mockRejectedValue(new Error('Scambio codice OAuth fallito: 400'));

    const res = await request(app).get('/api/spotify/callback').query({ code: 'scaduto' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

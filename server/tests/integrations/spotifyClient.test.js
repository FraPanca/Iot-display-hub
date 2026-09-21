jest.mock('../../src/config/redis');
jest.mock('../../src/utils/retry', () => ({ withRetry: jest.fn((fn) => fn()) }));

const { getRedisClient } = require('../../src/config/redis');
const spotify = require('../../src/integrations/spotifyClient');

const API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Instrada le chiamate fetch in base a metodo e URL
function mockFetchRoutes({ playback = null, token = { access_token: 'new-token', expires_in: 3600 }, controlStatus = 204 } = {}) {
  global.fetch = jest.fn(async (url, options = {}) => {
    const method = options.method || 'GET';
    if (url === TOKEN_URL) return jsonResponse(token);
    if (url === `${API}/me/player/currently-playing` && method === 'GET') {
      return playback ? jsonResponse(playback) : { ok: true, status: 204 };
    }
    return { ok: controlStatus < 400, status: controlStatus };
  });
}

function callsTo(method, urlPart) {
  return global.fetch.mock.calls.filter(([url, options = {}]) => (options.method || 'GET') === method && url.includes(urlPart));
}

describe('spotifyClient', () => {
  let redis;

  beforeEach(() => {
    process.env.SPOTIFY_CLIENT_ID = 'client-id';
    process.env.SPOTIFY_CLIENT_SECRET = 'client-secret';
    process.env.SPOTIFY_REFRESH_TOKEN = 'refresh-token';

    redis = { get: jest.fn().mockResolvedValue('cached-token'), set: jest.fn().mockResolvedValue('OK') };
    getRedisClient.mockReturnValue(redis);
    mockFetchRoutes();
  });

  afterEach(() => {
    delete global.fetch;
  });

  describe('getAccessToken', () => {
    it('usa il token in cache senza chiamare Spotify', async () => {
      await expect(spotify.getAccessToken()).resolves.toBe('cached-token');

      expect(redis.get).toHaveBeenCalledWith('spotify:access_token');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('con cache vuota fa il refresh con il refresh token e Basic auth', async () => {
      redis.get.mockResolvedValue(null);

      await expect(spotify.getAccessToken()).resolves.toBe('new-token');

      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe(TOKEN_URL);
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('client-id:client-secret').toString('base64')}`);
      expect(options.body.get('grant_type')).toBe('refresh_token');
      expect(options.body.get('refresh_token')).toBe('refresh-token');
    });

    it('salva il nuovo token su Redis con TTL ridotto di 60 secondi', async () => {
      redis.get.mockResolvedValue(null);

      await spotify.getAccessToken();

      expect(redis.set).toHaveBeenCalledWith('spotify:access_token', 'new-token', { EX: 3540 });
    });

    it('non usa mai un TTL inferiore a 60 secondi', async () => {
      redis.get.mockResolvedValue(null);
      mockFetchRoutes({ token: { access_token: 'short', expires_in: 90 } });

      await spotify.getAccessToken();

      expect(redis.set).toHaveBeenCalledWith('spotify:access_token', 'short', { EX: 60 });
    });

    it('lancia un errore se il refresh fallisce e non scrive in cache', async () => {
      redis.get.mockResolvedValue(null);
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 });

      await expect(spotify.getAccessToken()).rejects.toThrow('Refresh token Spotify fallito: 400');
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('scambia il code inviando redirect_uri e Basic auth', async () => {
      const tokens = { access_token: 'a', refresh_token: 'r' };
      global.fetch = jest.fn().mockResolvedValue(jsonResponse(tokens));

      await expect(spotify.exchangeCodeForTokens('abc', 'http://127.0.0.1:3001/api/spotify/callback')).resolves.toEqual(tokens);

      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe(TOKEN_URL);
      expect(options.body.get('grant_type')).toBe('authorization_code');
      expect(options.body.get('code')).toBe('abc');
      expect(options.body.get('redirect_uri')).toBe('http://127.0.0.1:3001/api/spotify/callback');
      expect(options.headers.Authorization).toMatch(/^Basic /);
    });

    it('lancia un errore se Spotify rifiuta il code', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 });

      await expect(spotify.exchangeCodeForTokens('scaduto', 'uri')).rejects.toThrow('Scambio codice OAuth fallito: 400');
    });
  });

  describe('getPlaybackState', () => {
    it('ritorna null se non c\'e nessuna riproduzione (204)', async () => {
      await expect(spotify.getPlaybackState()).resolves.toBeNull();
    });

    it('invia il bearer token e ritorna lo stato', async () => {
      const state = { is_playing: true, item: { id: 't1' } };
      mockFetchRoutes({ playback: state });

      await expect(spotify.getPlaybackState()).resolves.toEqual(state);
      expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer cached-token');
    });

    it('lancia un errore per uno status non ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

      await expect(spotify.getPlaybackState()).rejects.toThrow('Lettura stato Spotify fallita: 500');
    });
  });

  describe('sendControl', () => {
    it('play_pause mette in pausa se sta suonando', async () => {
      mockFetchRoutes({ playback: { is_playing: true } });

      await spotify.sendControl('play_pause');

      expect(callsTo('PUT', '/me/player/pause')).toHaveLength(1);
      expect(callsTo('PUT', '/me/player/play')).toHaveLength(0);
    });

    it('play_pause riprende se e in pausa', async () => {
      mockFetchRoutes({ playback: { is_playing: false } });

      await spotify.sendControl('play_pause');

      expect(callsTo('PUT', '/me/player/play')).toHaveLength(1);
      expect(callsTo('PUT', '/me/player/pause')).toHaveLength(0);
    });

    it('play_pause prova play se non c\'e nessuno stato', async () => {
      await spotify.sendControl('play_pause');

      expect(callsTo('PUT', '/me/player/play')).toHaveLength(1);
    });

    it('next e previous usano POST', async () => {
      await spotify.sendControl('next');
      await spotify.sendControl('previous');

      expect(callsTo('POST', '/me/player/next')).toHaveLength(1);
      expect(callsTo('POST', '/me/player/previous')).toHaveLength(1);
    });

    it.each([
      [false, 'true'],
      [true, 'false'],
    ])('shuffle con stato attuale %s imposta state=%s', async (current, expected) => {
      mockFetchRoutes({ playback: { shuffle_state: current } });

      await spotify.sendControl('shuffle');

      const [call] = callsTo('PUT', '/me/player/shuffle');
      expect(call[0]).toBe(`${API}/me/player/shuffle?state=${expected}`);
    });

    it.each([
      ['off', 'context'],
      ['context', 'off'],
      ['track', 'off'],
    ])('repeat con stato attuale %s imposta state=%s', async (current, expected) => {
      mockFetchRoutes({ playback: { repeat_state: current } });

      await spotify.sendControl('repeat');

      const [call] = callsTo('PUT', '/me/player/repeat');
      expect(call[0]).toBe(`${API}/me/player/repeat?state=${expected}`);
    });

    describe('risposte non ok ai comandi', () => {
      const ACTIONS = ['play_pause', 'next', 'previous', 'shuffle', 'repeat'];

      it.each(ACTIONS)('%s risolve senza errori con una risposta 204', async (action) => {
        mockFetchRoutes({ controlStatus: 204 });

        await expect(spotify.sendControl(action)).resolves.toBeUndefined();
      });

      it.each(ACTIONS.flatMap((action) => [[action, 403], [action, 404]]))(
        '%s rigetta con un errore esplicito su status %i',
        async (action, status) => {
          mockFetchRoutes({ controlStatus: status });

          await expect(spotify.sendControl(action)).rejects.toThrow(`Comando Spotify '${action}' fallito: ${status}`);
        },
      );

      it('l\'errore di un comando non altera la lettura dello stato', async () => {
        mockFetchRoutes({ playback: { is_playing: true }, controlStatus: 403 });

        await expect(spotify.sendControl('play_pause')).rejects.toThrow('403');
        expect(callsTo('PUT', '/me/player/pause')).toHaveLength(1);
      });
    });

    it('rifiuta un\'azione sconosciuta senza chiamare le API di controllo', async () => {
      await expect(spotify.sendControl('teletrasporto')).rejects.toThrow('Azione Spotify sconosciuta: teletrasporto');

      expect(callsTo('PUT', '/me/player')).toHaveLength(0);
      expect(callsTo('POST', '/me/player')).toHaveLength(0);
    });
  });

  describe('getCoverUrl', () => {
    const playback = {
      item: {
        id: 'track-1',
        album: { images: [{ url: 'https://img.test/large.jpg' }, { url: 'https://img.test/small.jpg' }] },
      },
    };

    it('ritorna l\'URL della prima immagine se il track_id coincide', async () => {
      mockFetchRoutes({ playback });

      await expect(spotify.getCoverUrl('track-1')).resolves.toBe('https://img.test/large.jpg');
    });

    it('ritorna null se il brano in riproduzione e cambiato', async () => {
      mockFetchRoutes({ playback });

      await expect(spotify.getCoverUrl('altro-brano')).resolves.toBeNull();
    });

    it('ritorna null se non c\'e nessuna riproduzione', async () => {
      await expect(spotify.getCoverUrl('track-1')).resolves.toBeNull();
    });

    it('ritorna null se l\'album non ha immagini', async () => {
      mockFetchRoutes({ playback: { item: { id: 'track-1', album: { images: [] } } } });

      await expect(spotify.getCoverUrl('track-1')).resolves.toBeNull();
    });
  });
});

const { getRedisClient } = require('../config/redis');
const { withRetry } = require('../utils/retry');

const TOKEN_CACHE_KEY = 'spotify:access_token';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

function basicAuthHeader() {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
  return Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
}

async function refreshAccessToken() {
  const { SPOTIFY_REFRESH_TOKEN } = process.env;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: SPOTIFY_REFRESH_TOKEN,
  });

  const data = await withRetry(async () => {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuthHeader()}`,
      },
      body,
    });

    if (!res.ok) {
      throw new Error(`Refresh token Spotify fallito: ${res.status}`);
    }

    return res.json();
  });

  const redis = getRedisClient();
  const ttlSeconds = Math.max(data.expires_in - 60, 60);
  await redis.set(TOKEN_CACHE_KEY, data.access_token, { EX: ttlSeconds });

  return data.access_token;
}

async function getAccessToken() {
  const redis = getRedisClient();
  const cached = await redis.get(TOKEN_CACHE_KEY);

  if (cached) {
    return cached;
  }

  return refreshAccessToken();
}

async function exchangeCodeForTokens(code, redirectUri) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuthHeader()}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Scambio codice OAuth fallito: ${res.status}`);
  }

  return res.json();
}

async function getPlaybackState() {
  const token = await getAccessToken();

  const res = await fetch(`${API_BASE}/me/player/currently-playing`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 204) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Lettura stato Spotify fallita: ${res.status}`);
  }

  return res.json();
}

async function checkControlResponse(res, action) {
  if (!res.ok) {
    throw new Error(`Comando Spotify '${action}' fallito: ${res.status}`);
  }
  return res;
}

async function togglePlayPause(headers) {
  const state = await getPlaybackState();
  const endpoint = state && state.is_playing ? 'pause' : 'play';
  const res = await fetch(`${API_BASE}/me/player/${endpoint}`, { method: 'PUT', headers });
  return checkControlResponse(res, 'play_pause');
}

async function toggleShuffle(headers) {
  const state = await getPlaybackState();
  const next = !(state && state.shuffle_state);
  const res = await fetch(`${API_BASE}/me/player/shuffle?state=${next}`, { method: 'PUT', headers });
  return checkControlResponse(res, 'shuffle');
}

async function toggleRepeat(headers) {
  const state = await getPlaybackState();
  const current = state ? state.repeat_state : 'off';
  const next = current === 'off' ? 'context' : 'off';
  const res = await fetch(`${API_BASE}/me/player/repeat?state=${next}`, { method: 'PUT', headers });
  return checkControlResponse(res, 'repeat');
}

async function sendControl(action) {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };

  const actionHandlers = {
    play_pause: () => togglePlayPause(headers),
    next: async () => checkControlResponse(
      await fetch(`${API_BASE}/me/player/next`, { method: 'POST', headers }),
      'next',
    ),
    previous: async () => checkControlResponse(
      await fetch(`${API_BASE}/me/player/previous`, { method: 'POST', headers }),
      'previous',
    ),
    shuffle: () => toggleShuffle(headers),
    repeat: () => toggleRepeat(headers),
  };

  const handler = actionHandlers[action];
  if (!handler) {
    throw new Error(`Azione Spotify sconosciuta: ${action}`);
  }

  await withRetry(handler);
}

async function getCoverUrl(trackId) {
  const state = await getPlaybackState();

  if (!state || !state.item || state.item.id !== trackId) {
    return null;
  }

  const images = state.item.album.images;
  return images && images.length ? images[0].url : null;
}

module.exports = {
  getAccessToken,
  exchangeCodeForTokens,
  getPlaybackState,
  sendControl,
  getCoverUrl,
};

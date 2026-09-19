const { TOPICS } = require('../config/mqtt');
const { publish } = require('../mqtt/client');
const { getPlaybackState, sendControl } = require('../integrations/spotifyClient');

const POLL_INTERVAL_MS = 5000;

let pollTimer = null;
let lastTrackId = null;
let lastIsPlaying = null;

function buildPayload(state) {
  if (!state || !state.item) {
    return {
      is_playing: false,
      track_id: null,
      title: null,
      album: null,
      artist: null,
      shuffle: false,
      repeat: 'off',
    };
  }

  return {
    is_playing: state.is_playing,
    track_id: state.item.id,
    title: state.item.name,
    album: state.item.album.name,
    artist: state.item.artists.map((artist) => artist.name).join(', '),
    shuffle: state.shuffle_state,
    repeat: state.repeat_state,
  };
}

async function publishCurrentState() {
  const state = await getPlaybackState();
  const payload = buildPayload(state);

  lastTrackId = payload.track_id;
  lastIsPlaying = payload.is_playing;

  await publish(TOPICS.dataSpotify, payload, { qos: 1 });
}

async function checkForChangeAndPublish() {
  const state = await getPlaybackState();
  const payload = buildPayload(state);

  const changed = payload.track_id !== lastTrackId || payload.is_playing !== lastIsPlaying;
  if (!changed) {
    return;
  }

  lastTrackId = payload.track_id;
  lastIsPlaying = payload.is_playing;

  await publish(TOPICS.dataSpotify, payload, { qos: 1 });
}

async function start() {
  await publishCurrentState();

  pollTimer = setInterval(() => {
    checkForChangeAndPublish().catch((err) => {
      console.error('Errore nel poll di stato Spotify', err.message);
    });
  }, POLL_INTERVAL_MS);
}

function stop() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function handleControl(payload) {
  await sendControl(payload.action);
  await checkForChangeAndPublish();
}

module.exports = { start, stop, handleControl, buildPayload };

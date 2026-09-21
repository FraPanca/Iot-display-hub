const { silenceConsole } = require('../helpers/silenceConsole');

silenceConsole();

function playbackState({ id = 't1', isPlaying = true, shuffle = false, repeat = 'off' } = {}) {
  return {
    is_playing: isPlaying,
    shuffle_state: shuffle,
    repeat_state: repeat,
    item: {
      id,
      name: 'Titolo',
      album: { name: 'Album' },
      artists: [{ name: 'Artista A' }, { name: 'Artista B' }],
    },
  };
}

// Carica il modulo da zero, lo stato interno (ultimo track_id, timer) non deve trapelare tra i test
function load() {
  jest.resetModules();
  const publish = jest.fn().mockResolvedValue();
  const client = { getPlaybackState: jest.fn(), sendControl: jest.fn().mockResolvedValue() };
  jest.doMock('../../src/mqtt/client', () => ({ publish }));
  jest.doMock('../../src/integrations/spotifyClient', () => client);

  const screen = require('../../src/screens/spotifyScreen');
  const { TOPICS } = require('../../src/config/mqtt');
  return { screen, publish, client, TOPICS };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('buildPayload', () => {
  const { screen } = load();

  it('mappa lo stato Spotify nel formato concordato per l\'ESP32', () => {
    expect(screen.buildPayload(playbackState({ shuffle: true, repeat: 'context' }))).toEqual({
      is_playing: true,
      track_id: 't1',
      title: 'Titolo',
      album: 'Album',
      artist: 'Artista A, Artista B',
      shuffle: true,
      repeat: 'context',
    });
  });

  it.each([
    ['stato nullo', null],
    ['stato senza item', { is_playing: false }],
  ])('ritorna il payload "nessuna riproduzione" con %s', (_label, state) => {
    expect(screen.buildPayload(state)).toEqual({
      is_playing: false,
      track_id: null,
      title: null,
      album: null,
      artist: null,
      shuffle: false,
      repeat: 'off',
    });
  });
});

describe('start e polling', () => {
  it('pubblica subito lo stato corrente su data/spotify con QoS 1', async () => {
    const { screen, publish, client, TOPICS } = load();
    client.getPlaybackState.mockResolvedValue(playbackState());

    await screen.start();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(TOPICS.dataSpotify, expect.objectContaining({ track_id: 't1' }), { qos: 1 });
    screen.stop();
  });

  it('interroga Spotify ogni 5 secondi ma non ripubblica se non cambia nulla', async () => {
    const { screen, publish, client } = load();
    client.getPlaybackState.mockResolvedValue(playbackState());
    await screen.start();

    await jest.advanceTimersByTimeAsync(15000);

    expect(client.getPlaybackState).toHaveBeenCalledTimes(1 + 3);
    expect(publish).toHaveBeenCalledTimes(1);
    screen.stop();
  });

  it('ripubblica quando cambia il track_id', async () => {
    const { screen, publish, client } = load();
    client.getPlaybackState.mockResolvedValue(playbackState({ id: 't1' }));
    await screen.start();

    client.getPlaybackState.mockResolvedValue(playbackState({ id: 't2' }));
    await jest.advanceTimersByTimeAsync(5000);

    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1][1].track_id).toBe('t2');
    screen.stop();
  });

  it('ripubblica quando cambia is_playing', async () => {
    const { screen, publish, client } = load();
    client.getPlaybackState.mockResolvedValue(playbackState({ isPlaying: true }));
    await screen.start();

    client.getPlaybackState.mockResolvedValue(playbackState({ isPlaying: false }));
    await jest.advanceTimersByTimeAsync(5000);

    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1][1].is_playing).toBe(false);
    screen.stop();
  });

  it('con nessuna riproduzione pubblica lo stato vuoto una volta sola', async () => {
    const { screen, publish, client } = load();
    client.getPlaybackState.mockResolvedValue(null);
    await screen.start();

    await jest.advanceTimersByTimeAsync(10000);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][1].track_id).toBeNull();
    screen.stop();
  });

  it('un errore durante il poll viene loggato e il polling continua', async () => {
    const { screen, publish, client } = load();
    client.getPlaybackState.mockResolvedValue(playbackState({ id: 't1' }));
    await screen.start();

    client.getPlaybackState.mockRejectedValueOnce(new Error('rete giu'));
    await jest.advanceTimersByTimeAsync(5000);
    expect(console.error).toHaveBeenCalled();

    client.getPlaybackState.mockResolvedValue(playbackState({ id: 't2' }));
    await jest.advanceTimersByTimeAsync(5000);

    expect(publish).toHaveBeenCalledTimes(2);
    screen.stop();
  });

  it('stop ferma il polling ed e idempotente', async () => {
    const { screen, client } = load();
    client.getPlaybackState.mockResolvedValue(playbackState());
    await screen.start();

    screen.stop();
    screen.stop();
    const callsAfterStop = client.getPlaybackState.mock.calls.length;
    await jest.advanceTimersByTimeAsync(30000);

    expect(client.getPlaybackState).toHaveBeenCalledTimes(callsAfterStop);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('se il primo fetch di start() fallisce logga l\'errore e il polling parte comunque', async () => {
    const { screen, publish, client } = load();
    client.getPlaybackState.mockRejectedValueOnce(new Error('token scaduto'));

    await expect(screen.start()).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(1);

    client.getPlaybackState.mockResolvedValue(playbackState({ id: 't1' }));
    await jest.advanceTimersByTimeAsync(5000);

    expect(client.getPlaybackState).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][1].track_id).toBe('t1');
    screen.stop();
  });

  it('dopo una pubblicazione fallita all\'avvio ripubblica lo stato invariato al poll successivo', async () => {
    const { screen, publish, client } = load();
    client.getPlaybackState.mockResolvedValue(playbackState({ id: 't1' }));
    publish.mockRejectedValueOnce(new Error('broker giu'));

    await screen.start();
    expect(publish).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(5000);

    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1][1].track_id).toBe('t1');
    screen.stop();
  });

  it('dopo una pubblicazione fallita in un poll ripubblica il cambio al poll successivo', async () => {
    const { screen, publish, client } = load();
    client.getPlaybackState.mockResolvedValue(playbackState({ id: 't1' }));
    await screen.start();

    client.getPlaybackState.mockResolvedValue(playbackState({ id: 't2' }));
    publish.mockRejectedValueOnce(new Error('broker giu'));
    await jest.advanceTimersByTimeAsync(5000);
    expect(publish).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(5000);

    expect(publish).toHaveBeenCalledTimes(3);
    expect(publish.mock.calls[2][1].track_id).toBe('t2');
    screen.stop();
  });

  it('una volta ripubblicato con successo non ripubblica piu lo stesso stato', async () => {
    const { screen, publish, client } = load();
    client.getPlaybackState.mockResolvedValue(playbackState({ id: 't1' }));
    publish.mockRejectedValueOnce(new Error('broker giu'));

    await screen.start();
    await jest.advanceTimersByTimeAsync(5000);
    await jest.advanceTimersByTimeAsync(15000);

    expect(publish).toHaveBeenCalledTimes(2);
    screen.stop();
  });
});

describe('handleControl', () => {
  it('inoltra l\'azione a Spotify e pubblica subito lo stato aggiornato', async () => {
    const { screen, publish, client } = load();
    client.getPlaybackState.mockResolvedValue(playbackState({ isPlaying: true }));
    await screen.start();

    client.getPlaybackState.mockResolvedValue(playbackState({ isPlaying: false }));
    await screen.handleControl({ action: 'play_pause' });

    expect(client.sendControl).toHaveBeenCalledWith('play_pause');
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1][1].is_playing).toBe(false);
    screen.stop();
  });

  it('non pubblica se dopo il comando lo stato non e cambiato', async () => {
    const { screen, publish, client } = load();
    client.getPlaybackState.mockResolvedValue(playbackState());
    await screen.start();

    await screen.handleControl({ action: 'shuffle' });

    expect(publish).toHaveBeenCalledTimes(1);
    screen.stop();
  });

  it('propaga l\'errore di sendControl senza pubblicare', async () => {
    const { screen, publish, client } = load();
    client.sendControl.mockRejectedValue(new Error('Azione Spotify sconosciuta: x'));

    await expect(screen.handleControl({ action: 'x' })).rejects.toThrow('Azione Spotify sconosciuta');
    expect(publish).not.toHaveBeenCalled();
  });
});
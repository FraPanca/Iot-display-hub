const { silenceConsole } = require('../helpers/silenceConsole');

silenceConsole();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

// Mocka i singoli screen e lascia reali screens/index.js e screenManager,
// cosi gli intervalli verificati sono quelli effettivamente configurati.
function load() {
  jest.resetModules();

  const mocks = {
    clock: { publishClock: jest.fn().mockResolvedValue() },
    weather: { publishWeather: jest.fn().mockResolvedValue(), handleDaySelect: jest.fn() },
    sysmon: { publishSysmon: jest.fn().mockResolvedValue() },
    quote: { publishQuote: jest.fn().mockResolvedValue() },
    spotify: { start: jest.fn().mockResolvedValue(), stop: jest.fn(), handleControl: jest.fn() },
  };

  jest.doMock('../../src/screens/clockScreen', () => mocks.clock);
  jest.doMock('../../src/screens/weatherScreen', () => mocks.weather);
  jest.doMock('../../src/screens/sysmonScreen', () => mocks.sysmon);
  jest.doMock('../../src/screens/quoteScreen', () => mocks.quote);
  jest.doMock('../../src/screens/spotifyScreen', () => mocks.spotify);

  const manager = require('../../src/mqtt/screenManager');
  const publishers = {
    clock: mocks.clock.publishClock,
    weather: mocks.weather.publishWeather,
    sysmon: mocks.sysmon.publishSysmon,
    quote: mocks.quote.publishQuote,
  };

  return { ...manager, publishers, spotify: mocks.spotify };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('intervalli per schermata', () => {
  it.each([
    ['clock', 60 * SECOND],
    ['weather', 30 * MINUTE],
    ['sysmon', 15 * SECOND],
    ['quote', 1 * HOUR],
  ])('%s pubblica subito e poi ogni %i ms', async (screenId, intervalMs) => {
    const { handleScreenChange, publishers } = load();
    const publish = publishers[screenId];

    await handleScreenChange(screenId);
    expect(publish).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(intervalMs - 1);
    expect(publish).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(publish).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(intervalMs);
    expect(publish).toHaveBeenCalledTimes(3);
  });

  it('imposta la schermata attiva', async () => {
    const { handleScreenChange, getActiveScreenId } = load();

    await handleScreenChange('weather');

    expect(getActiveScreenId()).toBe('weather');
  });
});

describe('cambio schermata', () => {
  it('ferma il timer della schermata precedente', async () => {
    const { handleScreenChange, publishers } = load();
    await handleScreenChange('clock');

    await handleScreenChange('weather');
    publishers.clock.mockClear();
    await jest.advanceTimersByTimeAsync(10 * MINUTE);

    expect(publishers.clock).not.toHaveBeenCalled();
  });

  it('pubblica subito il dato della nuova schermata e avvia il suo timer', async () => {
    const { handleScreenChange, publishers } = load();
    await handleScreenChange('clock');

    await handleScreenChange('sysmon');
    expect(publishers.sysmon).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(15 * SECOND);
    expect(publishers.sysmon).toHaveBeenCalledTimes(2);
  });

  it('mantiene un solo timer attivo alla volta', async () => {
    const { handleScreenChange } = load();

    await handleScreenChange('clock');
    await handleScreenChange('weather');
    await handleScreenChange('sysmon');
    await handleScreenChange('quote');

    expect(jest.getTimerCount()).toBe(1);
  });

  it('riselezionare la stessa schermata non duplica i timer', async () => {
    const { handleScreenChange, publishers } = load();

    await handleScreenChange('clock');
    await handleScreenChange('clock');
    publishers.clock.mockClear();
    await jest.advanceTimersByTimeAsync(60 * SECOND);

    expect(jest.getTimerCount()).toBe(1);
    expect(publishers.clock).toHaveBeenCalledTimes(1);
  });
});

describe('valore off', () => {
  it('non avvia nessun timer e non pubblica nulla', async () => {
    const { handleScreenChange, publishers, spotify, getActiveScreenId } = load();

    await handleScreenChange('off');

    expect(jest.getTimerCount()).toBe(0);
    Object.values(publishers).forEach((publish) => expect(publish).not.toHaveBeenCalled());
    expect(spotify.start).not.toHaveBeenCalled();
    expect(getActiveScreenId()).toBe('off');
  });

  it('ferma il timer della schermata che era attiva', async () => {
    const { handleScreenChange, publishers } = load();
    await handleScreenChange('sysmon');

    await handleScreenChange('off');
    publishers.sysmon.mockClear();
    await jest.advanceTimersByTimeAsync(5 * MINUTE);

    expect(publishers.sysmon).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('alla riaccensione riparte la schermata ripubblicata dal display', async () => {
    const { handleScreenChange, publishers } = load();
    await handleScreenChange('clock');
    await handleScreenChange('off');
    publishers.clock.mockClear();

    await handleScreenChange('clock');

    expect(publishers.clock).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
  });
});

describe('Spotify', () => {
  it('avvia spotifyScreen e non crea intervalli propri nello screenManager', async () => {
    const { handleScreenChange, spotify, getActiveScreenId } = load();

    await handleScreenChange('spotify');

    expect(spotify.start).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    expect(getActiveScreenId()).toBe('spotify');
  });

  it('non pubblica dati di altre schermate mentre Spotify e attivo', async () => {
    const { handleScreenChange, publishers } = load();

    await handleScreenChange('spotify');
    await jest.advanceTimersByTimeAsync(2 * HOUR);

    Object.values(publishers).forEach((publish) => expect(publish).not.toHaveBeenCalled());
  });

  it.each(['clock', 'off', 'weather'])('ferma il polling di spotifyScreen passando a %s', async (next) => {
    const { handleScreenChange, spotify } = load();
    await handleScreenChange('spotify');
    spotify.stop.mockClear();

    await handleScreenChange(next);

    expect(spotify.stop).toHaveBeenCalledTimes(1);
  });

  it('non chiama spotifyScreen.stop se la schermata precedente non era Spotify', async () => {
    const { handleScreenChange, spotify } = load();

    await handleScreenChange('clock');
    await handleScreenChange('weather');

    expect(spotify.stop).not.toHaveBeenCalled();
  });
});

describe('robustezza', () => {
  it('una schermata sconosciuta viene loggata e non avvia timer', async () => {
    const { handleScreenChange, getActiveScreenId } = load();

    await handleScreenChange('inesistente');

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('inesistente'));
    expect(jest.getTimerCount()).toBe(0);
    expect(getActiveScreenId()).toBeNull();
  });

  it('una schermata sconosciuta ferma comunque quella precedente', async () => {
    const { handleScreenChange, publishers } = load();
    await handleScreenChange('clock');

    await handleScreenChange('inesistente');
    publishers.clock.mockClear();
    await jest.advanceTimersByTimeAsync(5 * MINUTE);

    expect(publishers.clock).not.toHaveBeenCalled();
  });

  it('un errore nella pubblicazione iniziale non impedisce di avviare il timer', async () => {
    const { handleScreenChange, publishers } = load();
    publishers.weather.mockRejectedValueOnce(new Error('Open-Meteo giu'));

    await expect(handleScreenChange('weather')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(30 * MINUTE);
    expect(publishers.weather).toHaveBeenCalledTimes(2);
  });

  it('un errore in un tick del timer non ferma i tick successivi', async () => {
    const { handleScreenChange, publishers } = load();
    await handleScreenChange('sysmon');

    publishers.sysmon.mockRejectedValueOnce(new Error('errore transitorio'));
    await jest.advanceTimersByTimeAsync(15 * SECOND);
    await jest.advanceTimersByTimeAsync(15 * SECOND);

    expect(publishers.sysmon).toHaveBeenCalledTimes(3);
  });
});

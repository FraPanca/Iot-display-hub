jest.mock('../../src/config/redis');
jest.mock('../../src/utils/retry', () => ({ withRetry: jest.fn((fn) => fn()) }));

const { getRedisClient } = require('../../src/config/redis');
const { fetchWeather, mapCondition } = require('../../src/integrations/weatherClient');
const { silenceConsole } = require('../helpers/silenceConsole');

silenceConsole();

const CONDITIONS = ['clear', 'partly_cloudy', 'cloudy', 'rain', 'thunderstorm', 'snow', 'fog'];

const WMO_CASES = [
  [0, 'clear'], [1, 'clear'],
  [2, 'partly_cloudy'],
  [3, 'cloudy'],
  [45, 'fog'], [48, 'fog'],
  [51, 'rain'], [53, 'rain'], [55, 'rain'], [56, 'rain'], [57, 'rain'],
  [61, 'rain'], [63, 'rain'], [65, 'rain'], [66, 'rain'], [67, 'rain'],
  [71, 'snow'], [73, 'snow'], [75, 'snow'], [77, 'snow'],
  [80, 'rain'], [81, 'rain'], [82, 'rain'],
  [85, 'snow'], [86, 'snow'],
  [95, 'thunderstorm'], [96, 'thunderstorm'], [99, 'thunderstorm'],
];

function openMeteoResponse() {
  return {
    current: {
      weather_code: 61,
      temperature_2m: 21.5,
      relative_humidity_2m: 63,
      wind_speed_10m: 14.2,
      precipitation_probability: 40,
    },
    daily: {
      time: ['2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'],
      weather_code: [61, 0, 3, 95, 71],
      temperature_2m_min: [17, 15, 14, 13, 0],
      temperature_2m_max: [22, 24, 20, 18, 4],
      precipitation_probability_max: [40, 5, null, 80, 60],
    },
  };
}

describe('mapCondition', () => {
  it.each(WMO_CASES)('mappa il weather code %i su %s', (code, expected) => {
    expect(mapCondition(code)).toBe(expected);
  });

  it('usa cloudy come fallback per un codice sconosciuto o mancante', () => {
    expect(mapCondition(12345)).toBe('cloudy');
    expect(mapCondition(undefined)).toBe('cloudy');
  });

  it('restituisce sempre un valore dell\'enum condition concordato con il firmware', () => {
    const codes = [...WMO_CASES.map(([code]) => code), 999];
    codes.forEach((code) => {
      expect(CONDITIONS).toContain(mapCondition(code));
    });
  });
});

describe('fetchWeather', () => {
  let redis;

  beforeEach(() => {
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') };
    getRedisClient.mockReturnValue(redis);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => openMeteoResponse() });
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('restituisce il valore in cache senza chiamare Open-Meteo', async () => {
    const cached = { current: { condition: 'clear' }, forecast: [] };
    redis.get.mockResolvedValue(JSON.stringify(cached));

    await expect(fetchWeather()).resolves.toEqual(cached);
    expect(redis.get).toHaveBeenCalledWith('weather:current');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('chiama Open-Meteo con i parametri attesi', async () => {
    await fetchWeather();

    const url = global.fetch.mock.calls[0][0];
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('latitude')).toBeTruthy();
    expect(url.searchParams.get('longitude')).toBeTruthy();
    expect(url.searchParams.get('timezone')).toBe('auto');
    expect(url.searchParams.get('forecast_days')).toBe('5');
    expect(url.searchParams.get('current')).toContain('weather_code');
    expect(url.searchParams.get('daily')).toContain('precipitation_probability_max');
  });

  it('costruisce il payload nel formato definito in C-mqtt-topics-and-apis', async () => {
    const result = await fetchWeather();

    expect(result.current).toEqual({
      condition: 'rain',
      temp: 21.5,
      humidity: 63,
      wind_speed: 14.2,
      precip_prob: 40,
    });
    expect(result.forecast).toHaveLength(5);
    expect(result.forecast[0]).toEqual({
      day: 'Oggi',
      condition: 'rain',
      temp_min: 17,
      temp_max: 22,
      precip_prob: 40,
    });
    result.forecast.forEach((day) => {
      expect(CONDITIONS).toContain(day.condition);
      expect(Object.keys(day).sort()).toEqual(['condition', 'day', 'precip_prob', 'temp_max', 'temp_min']);
    });
  });

  it('usa nomi giorno abbreviati in italiano con iniziale maiuscola dopo Oggi', async () => {
    const result = await fetchWeather();

    expect(result.forecast.map((day) => day.day)).toEqual(['Oggi', 'Dom', 'Lun', 'Mar', 'Mer']);
  });

  it('sostituisce con 0 una probabilita di precipitazione nulla', async () => {
    const result = await fetchWeather();

    expect(result.forecast[2].precip_prob).toBe(0);
  });

  it('usa 0 se la probabilita di precipitazione corrente manca', async () => {
    const data = openMeteoResponse();
    data.current.precipitation_probability = null;
    global.fetch.mockResolvedValue({ ok: true, json: async () => data });

    const result = await fetchWeather();

    expect(result.current.precip_prob).toBe(0);
  });

  it('salva il risultato su Redis con TTL di 30 minuti', async () => {
    const result = await fetchWeather();

    expect(redis.set).toHaveBeenCalledWith('weather:current', JSON.stringify(result), { EX: 1800 });
  });

  it('propaga l\'errore se Open-Meteo risponde con uno status non ok e non scrive in cache', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(fetchWeather()).rejects.toThrow('Open-Meteo risposta non ok: 500');
    expect(redis.set).not.toHaveBeenCalled();
  });
});

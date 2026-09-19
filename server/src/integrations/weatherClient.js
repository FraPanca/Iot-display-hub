const { getRedisClient } = require('../config/redis');
const { withRetry } = require('../utils/retry');

const CACHE_KEY = 'weather:current';
const CACHE_TTL_SECONDS = 30 * 60;

// Coordinate di default (Roma), da sostituire con quelle reali della posizione del display.
const LATITUDE = process.env.WEATHER_LAT || '41.9028';
const LONGITUDE = process.env.WEATHER_LON || '12.4964';

// Mapping weather code numerico WMO (Open-Meteo) verso l'enum condition interno.
// Deve corrispondere 1:1 alle icone incorporate nel firmware.
const CONDITION_MAP = {
  0: 'clear',
  1: 'clear',
  2: 'partly_cloudy',
  3: 'cloudy',
  45: 'fog',
  48: 'fog',
  51: 'rain',
  53: 'rain',
  55: 'rain',
  56: 'rain',
  57: 'rain',
  61: 'rain',
  63: 'rain',
  65: 'rain',
  66: 'rain',
  67: 'rain',
  71: 'snow',
  73: 'snow',
  75: 'snow',
  77: 'snow',
  80: 'rain',
  81: 'rain',
  82: 'rain',
  85: 'snow',
  86: 'snow',
  95: 'thunderstorm',
  96: 'thunderstorm',
  99: 'thunderstorm',
};

function mapCondition(weatherCode) {
  return CONDITION_MAP[weatherCode] || 'cloudy';
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function buildForecast(daily) {
  const weekdayFormatter = new Intl.DateTimeFormat('it-IT', { weekday: 'short' });

  return daily.time.map((dateStr, index) => ({
    day: index === 0 ? 'Oggi' : capitalize(weekdayFormatter.format(new Date(dateStr))),
    condition: mapCondition(daily.weather_code[index]),
    temp_min: daily.temperature_2m_min[index],
    temp_max: daily.temperature_2m_max[index],
    precip_prob: daily.precipitation_probability_max[index] ?? 0,
  }));
}

async function fetchFromOpenMeteo() {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', LATITUDE);
  url.searchParams.set('longitude', LONGITUDE);
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation_probability');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '5');

  return withRetry(async () => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open-Meteo risposta non ok: ${res.status}`);
    }
    return res.json();
  });
}

async function fetchWeather() {
  const redis = getRedisClient();
  const cached = await redis.get(CACHE_KEY);

  if (cached) {
    return JSON.parse(cached);
  }

  const data = await fetchFromOpenMeteo();

  const result = {
    current: {
      condition: mapCondition(data.current.weather_code),
      temp: data.current.temperature_2m,
      humidity: data.current.relative_humidity_2m,
      wind_speed: data.current.wind_speed_10m,
      precip_prob: data.current.precipitation_probability ?? 0,
    },
    forecast: buildForecast(data.daily),
  };

  await redis.set(CACHE_KEY, JSON.stringify(result), { EX: CACHE_TTL_SECONDS });

  return result;
}

module.exports = { fetchWeather, mapCondition };

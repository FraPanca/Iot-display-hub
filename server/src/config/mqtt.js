const DISPLAY_ID = process.env.DISPLAY_ID || 'cyd-01';
const TOPIC_PREFIX = `display/${DISPLAY_ID}`;

const TOPICS = {
  status: `${TOPIC_PREFIX}/status`,
  screenCurrent: `${TOPIC_PREFIX}/screen/current`,
  eventAll: `${TOPIC_PREFIX}/event/#`,
  eventWeatherDaySelect: `${TOPIC_PREFIX}/event/weather/day_select`,
  eventSpotifyControl: `${TOPIC_PREFIX}/event/spotify/control`,
  eventSystemShutdown: `${TOPIC_PREFIX}/event/system/shutdown`,
  eventSystemOtaResult: `${TOPIC_PREFIX}/event/system/ota_result`,
  dataClock: `${TOPIC_PREFIX}/data/clock`,
  dataWeather: `${TOPIC_PREFIX}/data/weather`,
  dataSpotify: `${TOPIC_PREFIX}/data/spotify`,
  dataSysmon: `${TOPIC_PREFIX}/data/sysmon`,
  dataQuote: `${TOPIC_PREFIX}/data/quote`,
  dataSystem: `${TOPIC_PREFIX}/data/system`,
  dataFirmware: `${TOPIC_PREFIX}/data/firmware`,
};

const MQTT_URL = `mqtt://${process.env.MQTT_HOST || 'mosquitto'}:${process.env.MQTT_PORT || 1883}`;

module.exports = {
  DISPLAY_ID,
  TOPIC_PREFIX,
  TOPICS,
  MQTT_URL,
  MQTT_USER: process.env.MQTT_USER,
  MQTT_PASSWORD: process.env.MQTT_PASSWORD,
};

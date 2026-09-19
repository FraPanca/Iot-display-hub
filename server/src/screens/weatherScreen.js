const { TOPICS } = require('../config/mqtt');
const { publish } = require('../mqtt/client');
const { fetchWeather } = require('../integrations/weatherClient');

async function publishWeather() {
  const payload = await fetchWeather();
  await publish(TOPICS.dataWeather, payload, { qos: 1 });
}

// La UI aggiorna la selezione giorno localmente sui dati forecast gia ricevuti.
// Questo evento serve solo per logging/sincronizzazione futura lato server.
function handleDaySelect(payload) {
  console.log('Giorno meteo selezionato sul display:', payload);
}

module.exports = { publishWeather, handleDaySelect };

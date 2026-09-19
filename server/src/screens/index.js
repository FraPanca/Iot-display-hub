const clockScreen = require('./clockScreen');
const weatherScreen = require('./weatherScreen');
const sysmonScreen = require('./sysmonScreen');
const quoteScreen = require('./quoteScreen');
const spotifyScreen = require('./spotifyScreen');

// Intervallo (ms) e funzione di pubblicazione per ogni schermata gestita con
// timer periodico standard dallo screenManager.
const SCREEN_CONFIG = {
  clock: { intervalMs: 60 * 1000, publish: clockScreen.publishClock },
  weather: { intervalMs: 30 * 60 * 1000, publish: weatherScreen.publishWeather },
  sysmon: { intervalMs: 15 * 1000, publish: sysmonScreen.publishSysmon },
  quote: { intervalMs: 60 * 60 * 1000, publish: quoteScreen.publishQuote },
};

module.exports = { SCREEN_CONFIG, spotifyScreen };

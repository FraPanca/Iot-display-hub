const express = require('express');

const { connectDb } = require('./config/db');
const { connectRedis } = require('./config/redis');
const { connectMqtt } = require('./mqtt/client');
const { seedQuotes } = require('../scripts/seedQuotes');
const { handleScreenChange } = require('./mqtt/screenManager');
const { handleDaySelect } = require('./screens/weatherScreen');
const spotifyScreen = require('./screens/spotifyScreen');
const { handleShutdownEvent, handleOtaResult } = require('./screens/systemScreen');
const { startFirmwareUpdater } = require('./system/firmwareUpdater');

const healthRouter = require('./routes/health');
const spotifyRouter = require('./routes/spotify');
const firmwareRouter = require('./routes/firmware');

const app = express();

app.use('/api', healthRouter);
app.use('/api', spotifyRouter);
app.use('/api', firmwareRouter);

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDb();

  await seedQuotes().catch((err) => {
    console.error('Errore durante il seed automatico delle frasi', err.message);
  });

  await connectRedis();

  connectMqtt({
    onScreenChange: (screenId) => {
      handleScreenChange(screenId).catch((err) => {
        console.error('Errore nella gestione del cambio schermata', err.message);
      });
    },
    onSpotifyControl: (payload) => {
      spotifyScreen.handleControl(payload).catch((err) => {
        console.error('Errore nella gestione del controllo Spotify', err.message);
      });
    },
    onWeatherDaySelect: (payload) => {
      handleDaySelect(payload);
    },
    onShutdownRequest: (payload) => {
      handleShutdownEvent(payload).catch((err) => {
        console.error('Errore nella gestione dello shutdown', err.message);
      });
    },
    onOtaResult: (payload) => {
      handleOtaResult(payload);
    },
    onStatus: (payload) => {
      console.log(`Stato display ricevuto su status: ${payload}`);
    },
  });

  startFirmwareUpdater();

  app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Errore in fase di avvio del server', err.message);
    process.exit(1);
  });
}

module.exports = app;
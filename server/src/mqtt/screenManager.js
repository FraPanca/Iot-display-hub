const { SCREEN_CONFIG, spotifyScreen } = require('../screens');

let activeScreenId = null;
let activeTimer = null;

async function publishSafe(publishFn, options) {
  try {
    await publishFn(options);
  } catch (err) {
    console.error('Errore durante la pubblicazione dati schermata', err.message);
  }
}

function stopActive() {
  if (activeTimer) {
    clearInterval(activeTimer);
    activeTimer = null;
  }

  if (activeScreenId === 'spotify') {
    spotifyScreen.stop();
  }

  activeScreenId = null;
}

async function handleScreenChange(screenId) {
  stopActive();

  // "off" (display spento) non corrisponde a nessuna schermata nota: nessun timer.
  if (screenId === 'off') {
    activeScreenId = 'off';
    return;
  }

  if (screenId === 'spotify') {
    activeScreenId = 'spotify';
    await spotifyScreen.start();
    return;
  }

  const config = SCREEN_CONFIG[screenId];
  if (!config) {
    console.error(`Schermata sconosciuta ricevuta su screen/current: ${screenId}`);
    return;
  }

  activeScreenId = screenId;

  // Pubblica subito l'ultimo dato disponibile, così il display non resta vuoto
  // in attesa del primo giro del timer. force: true bypassa la dedup di
  // sysmonScreen (ignorato dagli altri screen, che non la usano).
  await publishSafe(config.publish, { force: true });

  activeTimer = setInterval(() => {
    publishSafe(config.publish);
  }, config.intervalMs);
}

function getActiveScreenId() {
  return activeScreenId;
}

module.exports = { handleScreenChange, getActiveScreenId };
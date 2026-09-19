const { requestShutdown } = require('../system/shutdownService');

async function handleShutdownEvent(payload) {
  await requestShutdown(payload);
}

// Nessuna azione applicativa richiesta lato server, solo logging per debug
function handleOtaResult(payload) {
  console.log('Esito aggiornamento OTA ricevuto dal display:', payload);
}

module.exports = { handleShutdownEvent, handleOtaResult };

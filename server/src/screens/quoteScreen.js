const { TOPICS } = require('../config/mqtt');
const { publish } = require('../mqtt/client');
const { getRandomQuote } = require('../repositories/quoteRepository');

async function publishQuote() {
  const text = await getRandomQuote();

  if (!text) {
    console.error('Nessuna frase disponibile in archivio, eseguire scripts/seedQuotes.js');
    return;
  }

  await publish(TOPICS.dataQuote, { text }, { qos: 1 });
}

module.exports = { publishQuote };

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const { connectDb } = require('../src/config/db');
const Quote = require('../src/models/Quote');

const SOURCE_FILE = path.join(__dirname, 'quotes.txt');

// Idempotente: controlla ogni frase prima di inserirla, sicura da chiamare
// ad ogni avvio del server senza creare duplicati.
async function seedQuotes() {
  const lines = fs.readFileSync(SOURCE_FILE, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  let inserted = 0;

  for (const text of lines) {
    const exists = await Quote.findOne({ text });
    if (!exists) {
      await Quote.create({ text });
      inserted++;
    }
  }

  console.log(`Seed frasi: inserite ${inserted} nuove su ${lines.length} lette da ${SOURCE_FILE}`);
  return inserted;
}

// Uso da riga di comando: apre e chiude la propria connessione Mongo.
async function seedStandalone() {
  await connectDb();
  await seedQuotes();
  await mongoose.disconnect();
}

if (require.main === module) {
  seedStandalone().catch((err) => {
    console.error('Errore durante il seed delle frasi', err.message);
    process.exit(1);
  });
}

module.exports = { seedQuotes };
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const { connectDb } = require('../src/config/db');
const Quote = require('../src/models/Quote');

const SOURCE_FILE = path.join(__dirname, 'quotes.txt');

async function seed() {
  await connectDb();

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

  console.log(`Inserite ${inserted} nuove frasi su ${lines.length} lette da ${SOURCE_FILE}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Errore durante il seed delle frasi', err.message);
  process.exit(1);
});

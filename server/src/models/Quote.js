const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
  text: { type: String, required: true },
  lastShownAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Quote', quoteSchema);

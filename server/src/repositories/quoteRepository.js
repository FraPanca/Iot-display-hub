const Quote = require('../models/Quote');

const EXCLUDE_LAST_N = 5;

async function getRandomQuote() {
  const recentlyShown = await Quote.find({ lastShownAt: { $ne: null } })
    .sort({ lastShownAt: -1 })
    .limit(EXCLUDE_LAST_N)
    .select('_id');

  const excludeIds = recentlyShown.map((quote) => quote._id);

  const candidates = await Quote.aggregate([
    { $match: { _id: { $nin: excludeIds } } },
    { $sample: { size: 1 } },
  ]);

  let selected = candidates[0];

  if (!selected) {
    const fallback = await Quote.aggregate([{ $sample: { size: 1 } }]);
    selected = fallback[0];
  }

  if (!selected) {
    return null;
  }

  await Quote.updateOne({ _id: selected._id }, { $set: { lastShownAt: new Date() } });

  return selected.text;
}

module.exports = { getRandomQuote, EXCLUDE_LAST_N };

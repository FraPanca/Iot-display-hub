jest.mock('../../src/models/Quote', () => ({
  find: jest.fn(),
  aggregate: jest.fn(),
  updateOne: jest.fn(),
}));

const Quote = require('../../src/models/Quote');
const { getRandomQuote, EXCLUDE_LAST_N } = require('../../src/repositories/quoteRepository');

// Catena find().sort().limit().select() risolta con i documenti indicati
function mockRecentlyShown(docs) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue(docs),
  };
  Quote.find.mockReturnValue(chain);
  return chain;
}

describe('getRandomQuote, chiamate al modello', () => {
  beforeEach(() => {
    Quote.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it('esclude le ultime N frasi mostrate, ordinate dalla piu recente', async () => {
    const chain = mockRecentlyShown([{ _id: 'a' }, { _id: 'b' }]);
    Quote.aggregate.mockResolvedValueOnce([{ _id: 'c', text: 'Frase C' }]);

    await getRandomQuote();

    expect(Quote.find).toHaveBeenCalledWith({ lastShownAt: { $ne: null } });
    expect(chain.sort).toHaveBeenCalledWith({ lastShownAt: -1 });
    expect(chain.limit).toHaveBeenCalledWith(EXCLUDE_LAST_N);
    expect(Quote.aggregate).toHaveBeenCalledWith([
      { $match: { _id: { $nin: ['a', 'b'] } } },
      { $sample: { size: 1 } },
    ]);
  });

  it('ritorna il testo e aggiorna lastShownAt della frase scelta', async () => {
    mockRecentlyShown([]);
    Quote.aggregate.mockResolvedValueOnce([{ _id: 'c', text: 'Frase C' }]);

    await expect(getRandomQuote()).resolves.toBe('Frase C');

    expect(Quote.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = Quote.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'c' });
    expect(update.$set.lastShownAt).toBeInstanceOf(Date);
  });

  it('se tutte le frasi sono escluse ripiega su una scelta senza esclusioni', async () => {
    mockRecentlyShown([{ _id: 'a' }]);
    Quote.aggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ _id: 'a', text: 'Unica frase' }]);

    await expect(getRandomQuote()).resolves.toBe('Unica frase');

    expect(Quote.aggregate).toHaveBeenCalledTimes(2);
    expect(Quote.aggregate).toHaveBeenLastCalledWith([{ $sample: { size: 1 } }]);
  });

  it('ritorna null e non aggiorna nulla se l\'archivio e vuoto', async () => {
    mockRecentlyShown([]);
    Quote.aggregate.mockResolvedValue([]);

    await expect(getRandomQuote()).resolves.toBeNull();
    expect(Quote.updateOne).not.toHaveBeenCalled();
  });

  it('usa N = 5 come finestra di esclusione', () => {
    expect(EXCLUDE_LAST_N).toBe(5);
  });
});

// Modello in memoria che riproduce solo le operazioni usate dal repository
function installInMemoryQuotes(texts) {
  const docs = texts.map((text, index) => ({ _id: `q${index}`, text, lastShownAt: null }));

  Quote.find.mockImplementation((filter) => {
    let result = docs.filter((doc) => (filter.lastShownAt.$ne === null ? doc.lastShownAt !== null : true));
    const chain = {
      sort: () => {
        result = [...result].sort((a, b) => b.lastShownAt - a.lastShownAt);
        return chain;
      },
      limit: (n) => {
        result = result.slice(0, n);
        return chain;
      },
      select: async () => result.map((doc) => ({ _id: doc._id })),
    };
    return chain;
  });

  Quote.aggregate.mockImplementation(async (pipeline) => {
    let pool = docs;
    const match = pipeline.find((stage) => stage.$match);
    if (match) {
      const excluded = match.$match._id.$nin;
      pool = docs.filter((doc) => !excluded.includes(doc._id));
    }
    if (pool.length === 0) return [];
    return [pool[Math.floor(Math.random() * pool.length)]];
  });

  Quote.updateOne.mockImplementation(async (filter, update) => {
    const doc = docs.find((item) => item._id === filter._id);
    doc.lastShownAt = update.$set.lastShownAt;
  });

  return docs;
}

describe('getRandomQuote, comportamento con modello in memoria', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-19T10:00:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function pick() {
    const text = await getRandomQuote();
    jest.advanceTimersByTime(1000);
    return text;
  }

  it('non ripete nessuna delle ultime N frasi mostrate', async () => {
    installInMemoryQuotes(Array.from({ length: 12 }, (_, i) => `Frase ${i}`));

    const shown = [];
    for (let i = 0; i < 60; i++) {
      const text = await pick();
      const recent = shown.slice(-EXCLUDE_LAST_N);
      expect(recent).not.toContain(text);
      shown.push(text);
    }
  });

  it('con meno frasi della finestra di esclusione continua comunque a rispondere', async () => {
    installInMemoryQuotes(['Uno', 'Due', 'Tre']);

    for (let i = 0; i < 10; i++) {
      const text = await pick();
      expect(['Uno', 'Due', 'Tre']).toContain(text);
    }
  });

  it('con una sola frase la ripropone sempre', async () => {
    installInMemoryQuotes(['Sola']);

    await expect(pick()).resolves.toBe('Sola');
    await expect(pick()).resolves.toBe('Sola');
  });
});

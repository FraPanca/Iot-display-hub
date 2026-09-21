jest.mock('../../src/mqtt/client', () => ({ publish: jest.fn().mockResolvedValue() }));
jest.mock('../../src/repositories/quoteRepository');

const { publish } = require('../../src/mqtt/client');
const { getRandomQuote } = require('../../src/repositories/quoteRepository');
const { TOPICS } = require('../../src/config/mqtt');
const { publishQuote } = require('../../src/screens/quoteScreen');
const { silenceConsole } = require('../helpers/silenceConsole');

silenceConsole();

describe('quoteScreen', () => {
  it('pubblica la frase su data/quote con QoS 1', async () => {
    getRandomQuote.mockResolvedValue('La frase del momento.');

    await publishQuote();

    expect(publish).toHaveBeenCalledWith(TOPICS.dataQuote, { text: 'La frase del momento.' }, { qos: 1 });
  });

  it('non pubblica nulla e segnala l\'errore se l\'archivio e vuoto', async () => {
    getRandomQuote.mockResolvedValue(null);

    await publishQuote();

    expect(publish).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});

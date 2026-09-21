const { withRetry } = require('../../src/utils/retry');
const { silenceConsole } = require('../helpers/silenceConsole');

silenceConsole();

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('withRetry', () => {
  it('ritorna subito il risultato se il primo tentativo riesce', async () => {
    const fn = jest.fn().mockResolvedValue('ok');

    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('riprova dopo un fallimento e ritorna il risultato del tentativo riuscito', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn);
    await jest.advanceTimersByTimeAsync(500 + 1000);

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('rispetta il numero massimo di tentativi di default (3) e rilancia l\'ultimo errore', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockRejectedValueOnce(new Error('fail 3'))
      .mockResolvedValue('non deve arrivare qui');

    const assertion = expect(withRetry(fn)).rejects.toThrow('fail 3');
    await jest.advanceTimersByTimeAsync(10000);

    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('rispetta maxAttempts personalizzato', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('sempre ko'));

    const assertion = expect(withRetry(fn, { maxAttempts: 5, baseDelayMs: 10 })).rejects.toThrow('sempre ko');
    await jest.advanceTimersByTimeAsync(10000);

    await assertion;
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('applica backoff esponenziale a partire da baseDelayMs', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('ko'));

    const assertion = expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 })).rejects.toThrow('ko');

    await jest.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(99);
    expect(fn).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(199);
    expect(fn).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);

    await assertion;
  });

  it('non attende dopo l\'ultimo tentativo fallito', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('ko'));

    const assertion = expect(withRetry(fn, { maxAttempts: 2, baseDelayMs: 100 })).rejects.toThrow('ko');
    await jest.advanceTimersByTimeAsync(100);

    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });
});

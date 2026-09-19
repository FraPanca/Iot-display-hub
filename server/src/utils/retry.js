const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, options = {}) {
  const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs || DEFAULT_BASE_DELAY_MS;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const backoff = baseDelayMs * 2 ** (attempt - 1);
        console.error(`Tentativo ${attempt}/${maxAttempts} fallito, retry tra ${backoff}ms:`, err.message);
        await delay(backoff);
      }
    }
  }

  console.error(`Tutti i ${maxAttempts} tentativi falliti`, lastError ? lastError.message : '');
  throw lastError;
}

module.exports = { withRetry };

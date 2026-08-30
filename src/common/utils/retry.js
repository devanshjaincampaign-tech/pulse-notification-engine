export async function retryWithBackoff(fn, { maxAttempts = 3, baseDelayMs = 200, isRetryable = () => true } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!isRetryable(err)) {
        throw err;
      }

      console.log(`Attempt ${attempt} failed: ${err.message}`);

      if (attempt < maxAttempts) {
        const delay = baseDelayMs * 2 ** (attempt - 1);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
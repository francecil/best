/**
 * Retry utility for Bridge client requests
 */

export interface RetryOptions {
  /** Number of additional attempts after the first failure (0 = no retry) */
  attempts: number;
  /** Base delay in ms between retries */
  delay: number;
  /** Delay growth strategy:
   * - `'linear'`: each retry waits `delay * attempt` ms
   * - `'exponential'`: each retry waits `delay * 2^(attempt-1)` ms
   * - `undefined`: constant delay
   */
  backoff?: 'linear' | 'exponential';
}

/**
 * Execute `fn`, retrying on failure up to `options.attempts` additional times.
 *
 * @example
 * const result = await withRetry(() => fetch('...'), { attempts: 3, delay: 500, backoff: 'exponential' })
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.attempts; attempt++) {
    try {
      return await fn();
    }
    catch (error) {
      lastError = error;

      if (attempt < options.attempts) {
        const wait = getDelay(options, attempt + 1);
        await sleep(wait);
      }
    }
  }

  throw lastError;
}

function getDelay(options: RetryOptions, attempt: number): number {
  if (options.backoff === 'exponential') {
    return options.delay * 2 ** (attempt - 1);
  }
  if (options.backoff === 'linear') {
    return options.delay * attempt;
  }
  return options.delay;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

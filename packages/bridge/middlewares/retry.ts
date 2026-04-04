import type { Middleware } from '../core/types';

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
 * Retries the downstream middleware chain (and procedure) on failure.
 * Code after `next()` in this middleware only runs on the final successful attempt.
 *
 * @example
 * bridge.use(retry({ attempts: 3, delay: 500, backoff: 'exponential' }))
 */
export function retry(options: RetryOptions): Middleware {
  return async (ctx, next) => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= options.attempts; attempt++) {
      try {
        await next();
        return;
      }
      catch (error) {
        lastError = error;

        if (attempt < options.attempts) {
          await sleep(getDelay(options, attempt + 1));
        }
      }
    }

    throw lastError;
  };
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

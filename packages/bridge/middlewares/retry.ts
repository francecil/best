import type { Middleware } from '../core/types';
import { type RetryOptions, getDelay, sleep } from '../utils/retry';

export type { RetryOptions };

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

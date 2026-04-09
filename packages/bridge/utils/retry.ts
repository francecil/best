export interface RetryOptions {
  /** Number of additional attempts after the first failure (0 = no retry) */
  attempts: number;
  /** Base delay in ms between retries */
  delay: number;
  /**
   * Delay growth strategy:
   * - `'linear'`: each retry waits `delay * attempt` ms
   * - `'exponential'`: each retry waits `delay * 2^(attempt-1)` ms
   * - `undefined`: constant delay
   */
  backoff?: 'linear' | 'exponential';
  /** Optional cap applied after backoff calculation */
  maxDelay?: number;
}

/**
 * Calculate the wait time for a given retry attempt.
 * @param attempt 1-based attempt number (1 = first retry after initial failure)
 */
export function getDelay(options: Pick<RetryOptions, 'delay' | 'backoff' | 'maxDelay'>, attempt: number): number {
  let delay: number;

  if (options.backoff === 'exponential') {
    delay = options.delay * 2 ** (attempt - 1);
  }
  else if (options.backoff === 'linear') {
    delay = options.delay * attempt;
  }
  else {
    delay = options.delay;
  }

  return options.maxDelay !== undefined ? Math.min(delay, options.maxDelay) : delay;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

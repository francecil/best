import { BridgeError } from '../core/error';
import { JsonRpcErrorCode } from '../core/types';
import type { BridgeContext, Middleware } from '../core/types';

export interface RateLimitOptions {
  /** Sliding window duration in ms */
  window: number;
  /** Maximum number of requests allowed within the window */
  max: number;
}

/**
 * Limits the number of requests per origin within a sliding time window.
 * Throws `JsonRpcErrorCode.Forbidden` before calling `next()` if the limit is exceeded.
 *
 * @example
 * bridge.use(rateLimit({ window: 60_000, max: 100 }))
 */
export function rateLimit(options: RateLimitOptions): Middleware {
  const requestLog = new Map<string, number[]>();

  return async (ctx, next) => {
    const port = (ctx as BridgeContext).port;
    const origin = port.sender?.origin ?? port.sender?.url ?? 'unknown';
    const now = Date.now();
    const windowStart = now - options.window;

    const timestamps = requestLog.get(origin) ?? [];
    const recent = timestamps.filter(t => t > windowStart);

    if (recent.length >= options.max) {
      throw new BridgeError(
        JsonRpcErrorCode.Forbidden,
        `Rate limit exceeded: max ${options.max} requests per ${options.window}ms`,
      );
    }

    recent.push(now);
    requestLog.set(origin, recent);

    await next();
  };
}

/**
 * Built-in middleware for Extension Bridge
 */

import { BridgeError } from '../core/error';
import { JsonRpcErrorCode } from '../core/types';
import type { Middleware } from '../core/types';

/**
 * Validates that the incoming connection originates from one of the allowed origins.
 *
 * @example
 * bridge.use(validateOrigin(['https://example.com']))
 */
export function validateOrigin(allowedOrigins: string[]): Middleware {
  return {
    before(_req, ctx) {
      const senderOrigin = ctx.port.sender?.origin ?? ctx.port.sender?.url;

      if (!senderOrigin) {
        throw new BridgeError(
          JsonRpcErrorCode.Forbidden,
          'Request origin could not be determined',
        );
      }

      const allowed = allowedOrigins.some(origin => senderOrigin.startsWith(origin));

      if (!allowed) {
        throw new BridgeError(
          JsonRpcErrorCode.Forbidden,
          `Origin not allowed: ${senderOrigin}`,
        );
      }
    },
  };
}

/**
 * Limits the number of requests per origin within a sliding time window.
 *
 * @example
 * bridge.use(rateLimit({ window: 60_000, max: 100 }))
 */
export function rateLimit(options: { window: number; max: number }): Middleware {
  const requestLog = new Map<string, number[]>();

  return {
    before(_req, ctx) {
      const origin = ctx.port.sender?.origin ?? ctx.port.sender?.url ?? 'unknown';
      const now = Date.now();
      const windowStart = now - options.window;

      const timestamps = requestLog.get(origin) ?? [];
      // Evict entries outside the current window
      const recent = timestamps.filter(t => t > windowStart);

      if (recent.length >= options.max) {
        throw new BridgeError(
          JsonRpcErrorCode.Forbidden,
          `Rate limit exceeded: max ${options.max} requests per ${options.window}ms`,
        );
      }

      recent.push(now);
      requestLog.set(origin, recent);
    },
  };
}

/**
 * Logs every request, response, and error to the console.
 *
 * @example
 * bridge.use(createLoggerMiddleware())
 * bridge.use(createLoggerMiddleware({ level: 'debug' }))
 */
export function createLoggerMiddleware(options: { level?: 'debug' | 'info' } = {}): Middleware {
  const level = options.level ?? 'debug';
  const prefix = '[Bridge Middleware]';

  const log = (message: string, ...args: unknown[]) => {
    if (level === 'debug') {
      console.debug(prefix, message, ...args);
    }
    else {
      console.info(prefix, message, ...args);
    }
  };

  return {
    before(req) {
      log(`→ ${req.method}`, req.params);
    },
    after(res, ctx) {
      const duration = Date.now() - ctx.startTime;
      if ('result' in res) {
        log(`← ${ctx.path} (${duration}ms)`, res.result);
      }
      else {
        log(`← ${ctx.path} (${duration}ms) ERROR`, res.error);
      }
    },
    onError(error, req) {
      console.error(prefix, `✗ ${req.method}`, error);
    },
  };
}

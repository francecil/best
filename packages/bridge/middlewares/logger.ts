import type { Middleware } from '../core/types';
import { createLogger } from '../utils/logger';

export interface LoggerMiddlewareOptions {
  level?: 'debug' | 'info';
}

/**
 * Logs every request and response (or error) to the console.
 * Wraps `next()` so that both success and failure paths are covered.
 *
 * @example
 * bridge.use(createLoggerMiddleware())
 * bridge.use(createLoggerMiddleware({ level: 'info' }))
 */
export function createLoggerMiddleware(options: LoggerMiddlewareOptions = {}): Middleware {
  const level = options.level ?? 'debug';
  // Always enabled — the user opts in by adding the middleware.
  const logger = createLogger('Bridge', true);

  return async (ctx, next) => {
    logger[level](`→ ${ctx.req.method}`, ctx.req.params);
    try {
      await next();
      const duration = Date.now() - ctx.startTime;
      const result = ctx.res && 'result' in ctx.res ? ctx.res.result : ctx.res;
      logger[level](`← ${ctx.req.method} (${duration}ms)`, result);
    }
    catch (error) {
      const duration = Date.now() - ctx.startTime;
      logger.error(`${ctx.req.method} (${duration}ms)`, error);
      throw error;
    }
  };
}

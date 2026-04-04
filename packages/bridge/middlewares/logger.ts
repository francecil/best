import type { Middleware } from '../core/types';

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
  const prefix = '[Bridge]';

  const log = (...args: unknown[]) =>
    level === 'debug' ? console.debug(prefix, ...args) : console.info(prefix, ...args);

  return async (ctx, next) => {
    log(`→ ${ctx.req.method}`, ctx.req.params);
    try {
      await next();
      const duration = Date.now() - ctx.startTime;
      const result = ctx.res && 'result' in ctx.res ? ctx.res.result : ctx.res;
      log(`← ${ctx.req.method} (${duration}ms)`, result);
    }
    catch (error) {
      const duration = Date.now() - ctx.startTime;
      console.error(prefix, `✗ ${ctx.req.method} (${duration}ms)`, error);
      throw error;
    }
  };
}

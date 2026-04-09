import type { DevToolsEvent, Middleware, ServerMiddleware } from '../core/types';

/**
 * Forwards request/response/error events to all connected Bridge DevTools panels.
 *
 * Internally registers a `chrome.runtime.onConnect` listener for ports named
 * `'bridge:devtools'`, so no extra wiring is needed in the Bridge itself.
 *
 * Typically injected automatically when `debug: true` is passed to `createBridge`.
 *
 * @example
 * bridge.use(createDevToolsMiddleware())
 */
export function createDevToolsMiddleware(): ServerMiddleware {
  const devtoolsPorts = new Set<chrome.runtime.Port>();

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'bridge:devtools') return;
    devtoolsPorts.add(port);
    port.onDisconnect.addListener(() => devtoolsPorts.delete(port));
  });

  const emit = (event: DevToolsEvent) => {
    for (const port of devtoolsPorts) port.postMessage(event);
  };

  return async (ctx, next) => {
    emit({ type: 'request', id: ctx.req.id, path: ctx.req.method, data: ctx.req.params, timestamp: ctx.startTime });
    try {
      await next();
      const result = ctx.res && 'result' in ctx.res ? ctx.res.result : undefined;
      emit({ type: 'response', id: ctx.req.id, path: ctx.req.method, data: result, duration: Date.now() - ctx.startTime, timestamp: Date.now() });
    }
    catch (error) {
      emit({ type: 'error', id: ctx.req.id, path: ctx.req.method, data: error instanceof Error ? error.message : String(error), duration: Date.now() - ctx.startTime, timestamp: Date.now() });
      throw error;
    }
  };
}

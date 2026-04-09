import type { DevToolsEvent, ServerMiddleware } from '../core/types';

/**
 * Forwards request/response/error events to the Bridge DevTools panel that is
 * inspecting the same tab as the request originator.
 *
 * Internally registers a `chrome.runtime.onConnect` listener for ports named
 * `'bridge:devtools'`. Each panel must send a `{ type: 'devtools:init', tabId }`
 * handshake immediately after connecting so events can be routed per-tab.
 *
 * Typically injected automatically when `debug: true` is passed to `createBridge`.
 *
 * @example
 * bridge.use(createDevToolsMiddleware())
 */
export function createDevToolsMiddleware(): ServerMiddleware {
  // tabId → set of DevTools ports inspecting that tab
  const portsByTab = new Map<number, Set<chrome.runtime.Port>>();

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'bridge:devtools') return;

    // The panel must send a devtools:init handshake to identify its inspected tab.
    const onInit = (msg: unknown) => {
      if (
        typeof msg !== 'object'
        || msg === null
        || (msg as any).type !== 'devtools:init'
        || typeof (msg as any).tabId !== 'number'
      ) return;

      port.onMessage.removeListener(onInit);
      const tabId = (msg as any).tabId as number;

      if (!portsByTab.has(tabId)) portsByTab.set(tabId, new Set());
      portsByTab.get(tabId)!.add(port);

      port.onDisconnect.addListener(() => {
        const set = portsByTab.get(tabId);
        if (set) {
          set.delete(port);
          if (set.size === 0) portsByTab.delete(tabId);
        }
      });
    };

    port.onMessage.addListener(onInit);
  });

  const emit = (tabId: number | undefined, event: DevToolsEvent) => {
    if (tabId === undefined) return;
    const ports = portsByTab.get(tabId);
    if (!ports) return;
    for (const p of ports) p.postMessage(event);
  };

  return async (ctx, next) => {
    const tabId = ctx.port.sender?.tab?.id;
    emit(tabId, { type: 'request', id: ctx.req.id, path: ctx.req.method, data: ctx.req.params, timestamp: ctx.startTime });
    try {
      await next();
      const result = ctx.res && 'result' in ctx.res ? ctx.res.result : undefined;
      emit(tabId, { type: 'response', id: ctx.req.id, path: ctx.req.method, data: result, duration: Date.now() - ctx.startTime, timestamp: Date.now() });
    }
    catch (error) {
      emit(tabId, { type: 'error', id: ctx.req.id, path: ctx.req.method, data: error instanceof Error ? error.message : String(error), duration: Date.now() - ctx.startTime, timestamp: Date.now() });
      throw error;
    }
  };
}

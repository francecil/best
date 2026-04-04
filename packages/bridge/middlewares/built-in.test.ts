import type { Middleware, Router } from '../core/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bridge } from '../core/bridge';
import { BridgeError } from '../core/error';
import { createLoggerMiddleware, rateLimit, validateOrigin } from './built-in';
import { query } from '../core/procedure';
import { JsonRpcErrorCode } from '../core/types';

/** Flush all pending microtasks */
async function flush(ticks = 10) {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
}

describe('Middleware', () => {
  const connectListeners: Array<(port: chrome.runtime.Port) => void> = [];

  function makeMockPort(senderOrigin?: string) {
    let portMessageHandler: ((msg: unknown) => void) | undefined;
    const mockPort = {
      name: 'bridge',
      sender: {
        tab: { id: 1 },
        frameId: 0,
        origin: senderOrigin ?? 'https://example.com',
        url: senderOrigin ? `${senderOrigin}/page` : 'https://example.com/page',
      },
      postMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn((cb: (msg: unknown) => void) => {
          portMessageHandler = cb;
        }),
      },
      onDisconnect: {
        addListener: vi.fn(),
      },
    } as unknown as chrome.runtime.Port & { postMessage: ReturnType<typeof vi.fn> };

    return {
      mockPort,
      sendFromPage: (msg: unknown) => portMessageHandler!(msg),
    };
  }

  const echoRouter: Router = {
    echo: query(async (input: string) => input),
  };

  function setupBridge(router: Router, middlewares: Middleware[] = [], senderOrigin?: string) {
    connectListeners.length = 0;
    vi.stubGlobal('chrome', {
      runtime: {
        onConnect: {
          addListener: vi.fn((cb: (typeof connectListeners)[number]) => {
            connectListeners.push(cb);
          }),
        },
      },
    } as unknown as typeof chrome);

    const { mockPort, sendFromPage } = makeMockPort(senderOrigin);
    const bridge = new Bridge(router);
    for (const mw of middlewares) bridge.use(mw);
    bridge.listen();

    const onConnect = connectListeners[connectListeners.length - 1]!;
    onConnect(mockPort);
    mockPort.postMessage.mockClear();

    return { bridge, mockPort, sendFromPage };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── use() ────────────────────────────────────────────────────────────────

  describe('use()', () => {
    it('is chainable', () => {
      vi.stubGlobal('chrome', {
        runtime: { onConnect: { addListener: vi.fn() } },
      } as unknown as typeof chrome);
      const bridge = new Bridge(echoRouter);
      const mw: Middleware = {};
      expect(bridge.use(mw)).toBe(bridge);
    });
  });

  // ─── before hook ──────────────────────────────────────────────────────────

  describe('before hook', () => {
    it('runs before the procedure', async () => {
      const spy = vi.fn();
      const mw: Middleware = { before: spy };
      const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw]);

      sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hello' });
      await flush();

      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0][0]).toMatchObject({ method: 'echo', params: 'hello' });
    });

    it('can modify the request', async () => {
      const mw: Middleware = {
        before(req) {
          return { ...req, params: 'modified' };
        },
      };
      const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw]);

      sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'original' });
      await flush();

      const response = mockPort.postMessage.mock.calls.find(
        (args) => args[0].id === 1 && 'result' in args[0],
      );
      expect(response![0].result).toBe('modified');
    });

    it('aborting the request via a thrown error sends an error response', async () => {
      const mw: Middleware = {
        before() {
          throw new BridgeError(JsonRpcErrorCode.Forbidden, 'blocked');
        },
      };
      const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw]);

      sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
      await flush();

      const errorResponse = mockPort.postMessage.mock.calls.find(
        (args) => args[0].id === 1 && 'error' in args[0],
      );
      expect(errorResponse![0].error.code).toBe(JsonRpcErrorCode.Forbidden);
      expect(errorResponse![0].error.message).toBe('blocked');
    });

    it('runs multiple before hooks in order', async () => {
      const order: number[] = [];
      const mw1: Middleware = { before: () => { order.push(1); } };
      const mw2: Middleware = { before: () => { order.push(2); } };
      const mw3: Middleware = { before: () => { order.push(3); } };

      const { sendFromPage } = setupBridge(echoRouter, [mw1, mw2, mw3]);
      sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
      await flush();

      expect(order).toEqual([1, 2, 3]);
    });
  });

  // ─── after hook ───────────────────────────────────────────────────────────

  describe('after hook', () => {
    it('runs after a successful procedure call', async () => {
      const spy = vi.fn();
      const mw: Middleware = { after: spy };
      const { sendFromPage } = setupBridge(echoRouter, [mw]);

      sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
      await flush();

      expect(spy).toHaveBeenCalledOnce();
    });

    it('can modify the response', async () => {
      const mw: Middleware = {
        after(res) {
          if ('result' in res) return { ...res, result: 'overridden' };
        },
      };
      const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw]);

      sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
      await flush();

      const response = mockPort.postMessage.mock.calls.find(
        (args) => args[0].id === 1 && 'result' in args[0],
      );
      expect(response![0].result).toBe('overridden');
    });

    it('does not run when procedure throws', async () => {
      const afterSpy = vi.fn();
      const onErrorSpy = vi.fn();
      const mw: Middleware = { after: afterSpy, onError: onErrorSpy };

      const failRouter: Router = {
        fail: query(async () => { throw new Error('boom'); }),
      };
      const { sendFromPage } = setupBridge(failRouter, [mw]);

      sendFromPage({ jsonrpc: '2.0', id: 1, method: 'fail' });
      await flush();

      expect(afterSpy).not.toHaveBeenCalled();
      expect(onErrorSpy).toHaveBeenCalledOnce();
    });
  });

  // ─── onError hook ─────────────────────────────────────────────────────────

  describe('onError hook', () => {
    it('runs when a procedure throws', async () => {
      const spy = vi.fn();
      const mw: Middleware = { onError: spy };

      const failRouter: Router = {
        fail: query(async () => { throw new Error('boom'); }),
      };
      const { sendFromPage } = setupBridge(failRouter, [mw]);

      sendFromPage({ jsonrpc: '2.0', id: 1, method: 'fail' });
      await flush();

      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(spy.mock.calls[0][0].message).toBe('boom');
    });
  });

  // ─── validateOrigin ───────────────────────────────────────────────────────

  describe('validateOrigin()', () => {
    it('allows requests from allowed origins', async () => {
      const mw = validateOrigin(['https://example.com']);
      const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw], 'https://example.com');

      sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
      await flush();

      const response = mockPort.postMessage.mock.calls.find(
        (args) => args[0].id === 1,
      );
      expect(response![0]).toHaveProperty('result');
    });

    it('blocks requests from disallowed origins', async () => {
      const mw = validateOrigin(['https://allowed.com']);
      const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw], 'https://evil.com');

      sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
      await flush();

      const response = mockPort.postMessage.mock.calls.find(
        (args) => args[0].id === 1,
      );
      expect(response![0].error.code).toBe(JsonRpcErrorCode.Forbidden);
    });
  });

  // ─── rateLimit ────────────────────────────────────────────────────────────

  describe('rateLimit()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('allows requests within the limit', async () => {
      const mw = rateLimit({ window: 1000, max: 3 });
      const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw]);

      for (let i = 1; i <= 3; i++) {
        sendFromPage({ jsonrpc: '2.0', id: i, method: 'echo', params: 'hi' });
      }
      await flush();

      const errorResponses = mockPort.postMessage.mock.calls.filter(
        (args) => 'error' in args[0],
      );
      expect(errorResponses).toHaveLength(0);
    });

    it('blocks requests that exceed the limit', async () => {
      const mw = rateLimit({ window: 1000, max: 2 });
      const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw]);

      for (let i = 1; i <= 3; i++) {
        sendFromPage({ jsonrpc: '2.0', id: i, method: 'echo', params: 'hi' });
      }
      await flush();

      const errorResponses = mockPort.postMessage.mock.calls.filter(
        (args) => 'error' in args[0],
      );
      expect(errorResponses.length).toBeGreaterThan(0);
      expect(errorResponses[0][0].error.code).toBe(JsonRpcErrorCode.Forbidden);
    });

    it('resets after the window expires', async () => {
      const mw = rateLimit({ window: 1000, max: 1 });
      const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw]);

      sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
      await flush();

      // Advance past the window
      vi.advanceTimersByTime(1001);

      mockPort.postMessage.mockClear();
      sendFromPage({ jsonrpc: '2.0', id: 2, method: 'echo', params: 'hi' });
      await flush();

      const errorResponses = mockPort.postMessage.mock.calls.filter(
        (args) => 'error' in args[0],
      );
      expect(errorResponses).toHaveLength(0);
    });
  });

  // ─── createLoggerMiddleware ───────────────────────────────────────────────

  describe('createLoggerMiddleware()', () => {
    it('logs requests and responses without throwing', async () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const mw = createLoggerMiddleware();
      const { sendFromPage } = setupBridge(echoRouter, [mw]);

      sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
      await flush();

      expect(debugSpy).toHaveBeenCalled();
      debugSpy.mockRestore();
    });

    it('logs errors without throwing', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mw = createLoggerMiddleware();

      const failRouter: Router = {
        fail: query(async () => { throw new Error('boom'); }),
      };
      const { sendFromPage } = setupBridge(failRouter, [mw]);

      sendFromPage({ jsonrpc: '2.0', id: 1, method: 'fail' });
      await flush();

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});

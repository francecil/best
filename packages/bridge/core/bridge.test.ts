import type { Router } from './types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bridge } from './bridge';
import { BridgeError } from './error';
import { mutation, query, subscription } from './procedure';
import { JsonRpcErrorCode } from './types';

describe('Bridge (Service Worker)', () => {
  const connectListeners: Array<(port: chrome.runtime.Port) => void> = [];

  beforeEach(() => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  type MockPort = chrome.runtime.Port & { postMessage: ReturnType<typeof vi.fn> };

  function createMockPort() {
    let portMessageHandler: ((msg: unknown) => void) | undefined;
    const mockPort = {
      name: 'bridge',
      sender: { tab: { id: 1 }, frameId: 0 },
      postMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn((cb: (msg: unknown) => void) => {
          portMessageHandler = cb;
        }),
      },
      onDisconnect: {
        addListener: vi.fn(),
      },
    } as unknown as MockPort;

    return {
      mockPort,
      sendFromPage: (msg: unknown) => portMessageHandler!(msg),
    };
  }

  function connectBridgeWithRouter(router: Router, options?: import('./types').BridgeOptions) {
    const { mockPort, sendFromPage } = createMockPort();
    const bridge = new Bridge(router, options);
    bridge.listen();

    const onConnect = connectListeners[connectListeners.length - 1]!;
    onConnect(mockPort);

    return { bridge, mockPort, sendFromPage };
  }

  const mathRouter = {
    math: {
      double: query(async (n: number) => n * 2),
    },
  } satisfies Router;

  it('sends bridge:ready after port connects', () => {
    const { mockPort } = connectBridgeWithRouter(mathRouter);
    expect(mockPort.postMessage).toHaveBeenCalledWith({ type: 'bridge:ready' });
  });

  it('responds to JSON-RPC query with result', async () => {
    const { mockPort, sendFromPage } = connectBridgeWithRouter(mathRouter);
    mockPort.postMessage.mockClear();

    sendFromPage({
      jsonrpc: '2.0',
      id: 1,
      method: 'math.double',
      params: 21,
    });

    await vi.waitFor(() => {
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 1,
        result: 42,
      });
    });
  });

  it('responds with MethodNotFound error when procedure is missing', async () => {
    const { mockPort, sendFromPage } = connectBridgeWithRouter(mathRouter);
    mockPort.postMessage.mockClear();

    sendFromPage({
      jsonrpc: '2.0',
      id: 99,
      method: 'none.such',
      params: null,
    });

    await vi.waitFor(() => {
      const last = mockPort.postMessage.mock.calls[mockPort.postMessage.mock.calls.length - 1]?.[0] as {
        error?: { code?: number; message?: string };
      };
      expect(last?.error?.message).toContain('not found');
      expect(last?.error?.code).toBe(JsonRpcErrorCode.MethodNotFound);
    });
  });

  it('preserves BridgeError code in response', async () => {
    const router = {
      fail: {
        auth: mutation(async () => {
          throw new BridgeError(JsonRpcErrorCode.Unauthorized, 'not logged in');
        }),
      },
    } satisfies Router;

    const { mockPort, sendFromPage } = connectBridgeWithRouter(router);
    mockPort.postMessage.mockClear();

    sendFromPage({ jsonrpc: '2.0', id: 5, method: 'fail.auth', params: null });

    await vi.waitFor(() => {
      const last = mockPort.postMessage.mock.calls[mockPort.postMessage.mock.calls.length - 1]?.[0] as {
        error?: { code?: number; message?: string };
      };
      expect(last?.error?.code).toBe(JsonRpcErrorCode.Unauthorized);
      expect(last?.error?.message).toBe('not logged in');
    });
  });

  describe('Chrome API fallback', () => {
    function setupChromeWithBookmarks() {
      vi.stubGlobal('chrome', {
        runtime: {
          onConnect: {
            addListener: vi.fn((cb: (typeof connectListeners)[number]) => {
              connectListeners.push(cb);
            }),
          },
        },
        bookmarks: {
          getTree: vi.fn(async () => [{ id: '0', title: 'root' }]),
          search: vi.fn(async (query: unknown) => [{ id: '1', title: String(query) }]),
        },
        history: {
          search: vi.fn(async (opts: unknown) => [opts]),
        },
      } as unknown as typeof chrome);
    }

    it('falls through to MethodNotFound when chromeApi is not configured', async () => {
      const { mockPort, sendFromPage } = connectBridgeWithRouter(mathRouter);
      mockPort.postMessage.mockClear();

      sendFromPage({ jsonrpc: '2.0', id: 1, method: 'bookmarks.getTree', params: null });

      await vi.waitFor(() => {
        const last = mockPort.postMessage.mock.calls[mockPort.postMessage.mock.calls.length - 1]?.[0] as any;
        expect(last?.error?.code).toBe(JsonRpcErrorCode.MethodNotFound);
      });
    });

    it('calls Chrome API when chromeApi: true and procedure not in router', async () => {
      setupChromeWithBookmarks();
      connectListeners.length = 0;

      const { mockPort, sendFromPage } = connectBridgeWithRouter(mathRouter, { chromeApi: true });
      mockPort.postMessage.mockClear();

      sendFromPage({ jsonrpc: '2.0', id: 2, method: 'bookmarks.getTree', params: null });

      await vi.waitFor(() => {
        const last = mockPort.postMessage.mock.calls[mockPort.postMessage.mock.calls.length - 1]?.[0] as any;
        expect(last?.result).toEqual([{ id: '0', title: 'root' }]);
      });
    });

    it('calls Chrome API when namespace is in allowlist', async () => {
      setupChromeWithBookmarks();
      connectListeners.length = 0;

      const { mockPort, sendFromPage } = connectBridgeWithRouter(mathRouter, { chromeApi: ['bookmarks'] });
      mockPort.postMessage.mockClear();

      sendFromPage({ jsonrpc: '2.0', id: 3, method: 'bookmarks.search', params: 'test' });

      await vi.waitFor(() => {
        const last = mockPort.postMessage.mock.calls[mockPort.postMessage.mock.calls.length - 1]?.[0] as any;
        expect(last?.result).toEqual([{ id: '1', title: 'test' }]);
      });
    });

    it('returns MethodNotFound for namespace not in allowlist', async () => {
      setupChromeWithBookmarks();
      connectListeners.length = 0;

      const { mockPort, sendFromPage } = connectBridgeWithRouter(mathRouter, { chromeApi: ['bookmarks'] });
      mockPort.postMessage.mockClear();

      sendFromPage({ jsonrpc: '2.0', id: 4, method: 'history.search', params: null });

      await vi.waitFor(() => {
        const last = mockPort.postMessage.mock.calls[mockPort.postMessage.mock.calls.length - 1]?.[0] as any;
        expect(last?.error?.code).toBe(JsonRpcErrorCode.MethodNotFound);
      });
    });

    it('explicit router procedures take priority over Chrome API fallback', async () => {
      setupChromeWithBookmarks();
      connectListeners.length = 0;

      const routerWithBookmarks = {
        ...mathRouter,
        bookmarks: {
          getTree: query(async () => [{ id: 'custom', title: 'custom' }]),
        },
      };

      const { mockPort, sendFromPage } = connectBridgeWithRouter(routerWithBookmarks, { chromeApi: true });
      mockPort.postMessage.mockClear();

      sendFromPage({ jsonrpc: '2.0', id: 5, method: 'bookmarks.getTree', params: null });

      await vi.waitFor(() => {
        const last = mockPort.postMessage.mock.calls[mockPort.postMessage.mock.calls.length - 1]?.[0] as any;
        expect(last?.result).toEqual([{ id: 'custom', title: 'custom' }]);
      });
    });

    it('returns Forbidden error for event listener properties', async () => {
      setupChromeWithBookmarks();
      connectListeners.length = 0;

      const { mockPort, sendFromPage } = connectBridgeWithRouter(mathRouter, { chromeApi: true });
      mockPort.postMessage.mockClear();

      sendFromPage({ jsonrpc: '2.0', id: 6, method: 'bookmarks.onCreated', params: null });

      await vi.waitFor(() => {
        const last = mockPort.postMessage.mock.calls[mockPort.postMessage.mock.calls.length - 1]?.[0] as any;
        expect(last?.error?.code).toBe(JsonRpcErrorCode.Forbidden);
      });
    });
  });

  it('creates subscription and accepts $unsubscribe', async () => {
    const cleanup = vi.fn();
    const eventsRouter = {
      events: {
        tick: subscription<string>((emit) => {
          emit('first');
          return cleanup;
        }),
      },
    } satisfies Router;

    const { mockPort, sendFromPage } = connectBridgeWithRouter(eventsRouter);

    mockPort.postMessage.mockClear();
    sendFromPage({
      jsonrpc: '2.0',
      id: 10,
      method: 'events.tick',
      params: undefined,
    });

    await vi.waitFor(() => {
      const subCall = mockPort.postMessage.mock.calls.find(
        c => (c[0] as { result?: { subscriptionId?: string } })?.result?.subscriptionId,
      );
      expect(subCall).toBeDefined();
    });

    const subId = (
      mockPort.postMessage.mock.calls.find(
        c => (c[0] as { result?: { subscriptionId?: string } })?.result?.subscriptionId,
      )?.[0] as { result: { subscriptionId: string } }
    ).result.subscriptionId;

    expect(
      mockPort.postMessage.mock.calls.some(
        c => (c[0] as { method?: string })?.method === `$subscription:${subId}`,
      ),
    ).toBe(true);

    sendFromPage({
      method: `$unsubscribe:${subId}`,
    });

    await vi.waitFor(() => {
      expect(cleanup).toHaveBeenCalled();
    });
  });
});

import type { Router } from './types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bridge } from './bridge';
import { query, subscription } from './procedure';

describe('Bridge (Service Worker)', () => {
  const messageListeners: Array<
    (
      msg: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (r: unknown) => void,
    ) => boolean | void
  > = [];
  const connectListeners: Array<(port: chrome.runtime.Port) => void> = [];

  beforeEach(() => {
    messageListeners.length = 0;
    connectListeners.length = 0;
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: vi.fn((cb: (typeof messageListeners)[number]) => {
            messageListeners.push(cb);
          }),
        },
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
    } as unknown as chrome.runtime.Port;

    return {
      mockPort,
      sendFromPage: (msg: unknown) => portMessageHandler!(msg),
    };
  }

  function connectBridgeWithRouter(router: Router) {
    const { mockPort, sendFromPage } = createMockPort();
    const bridge = new Bridge(router);
    bridge.listen();

    messageListeners[0]!(
      { type: 'bridge:connect' },
      { tab: { id: 1 }, frameId: 0 } as chrome.runtime.MessageSender,
      vi.fn(),
    );

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

  it('responds with error when procedure is missing', async () => {
    const { mockPort, sendFromPage } = connectBridgeWithRouter(mathRouter);
    mockPort.postMessage.mockClear();

    sendFromPage({
      jsonrpc: '2.0',
      id: 99,
      method: 'none.such',
      params: null,
    });

    await vi.waitFor(() => {
      const last = mockPort.postMessage.mock.calls.at(-1)?.[0] as {
        error?: { message?: string };
      };
      expect(last?.error?.message).toContain('not found');
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

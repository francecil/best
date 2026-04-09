/**
 * Shared test helpers for middleware tests.
 * Not a test file itself — imported by *.test.ts files.
 */
import type { Middleware, Router, ServerMiddleware } from '../core/types';
import { vi } from 'vitest';
import { Bridge } from '../core/bridge';
import { query } from '../core/procedure';

export const connectListeners: Array<(port: chrome.runtime.Port) => void> = [];

export type MockPort = chrome.runtime.Port & { postMessage: ReturnType<typeof vi.fn> };

export function makeMockPort(senderOrigin?: string): {
  mockPort: MockPort;
  sendFromPage: (msg: unknown) => void;
} {
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
  } as unknown as MockPort;

  return {
    mockPort,
    sendFromPage: (msg: unknown) => portMessageHandler!(msg),
  };
}

export function setupBridge(
  router: Router,
  middlewares: Array<Middleware | ServerMiddleware> = [],
  senderOrigin?: string,
) {
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

/** Flush all pending microtasks */
export async function flush(ticks = 15) {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
}

/** Minimal echo router used across tests */
export const echoRouter: Router = {
  echo: query(async (input: string) => input),
};

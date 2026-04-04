/**
 * Bridge E2E Tests (Vitest)
 *
 * Wires Bridge (server) and BridgeClient (client) together in-process via a
 * MessageChannel, simulating the full request/response cycle without a real
 * browser or chrome extension runtime.
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { createBridge, createClient, mutation, query, subscription } from '../../index';
import type { InferClient } from '../../index';

// ─── Test Router ──────────────────────────────────────────────────────────────

const router = {
  echo: query(async (input: string) => input),
  add: mutation(async (input: { a: number; b: number }) => input.a + input.b),
  greet: query(async (name: string) => `Hello, ${name}!`),
  error: query(async () => {
    throw new Error('intentional error');
  }),
  counter: subscription<number>((emit) => {
    let count = 0;
    const id = setInterval(() => emit(++count), 100);
    return () => clearInterval(id);
  }),
};

type TestClient = InferClient<typeof router> & {
  $waitForReady: () => Promise<void>;
};

// ─── In-process bridge wiring ─────────────────────────────────────────────────

/**
 * Connects a Bridge and BridgeClient without a browser:
 *
 *  1. Mocks chrome.runtime.onConnect so the Bridge can call listen().
 *  2. Creates a MessageChannel; wraps port1 in a fake chrome.runtime.Port
 *     and passes it to the Bridge's onConnect handler.
 *  3. Registers a window message listener that intercepts the client's
 *     `bridge:connect` signal and immediately delivers `bridge:init` with
 *     port2, completing the handshake without a real content script.
 */
// Wraps the return value in a plain object to prevent JavaScript from treating
// the router Proxy as a thenable when it is returned from an async function.
async function createInProcessClient(): Promise<{ client: TestClient }> {
  // 1. Mock chrome.runtime for the Bridge
  const onConnectListeners: Array<(port: any) => void> = [];
  vi.stubGlobal('chrome', {
    runtime: {
      onConnect: {
        addListener: (cb: (port: any) => void) => onConnectListeners.push(cb),
      },
    },
  });

  createBridge(router, { debug: false }).listen();

  // 2. Build a bidirectional MessageChannel transport
  const channel = new MessageChannel();

  // Fake chrome.runtime.Port: Bridge writes to port1, which the client reads
  // from port2; client writes to port2, which the Bridge reads from port1.
  const bgHandlers: Array<(msg: any) => void> = [];
  const bridgePort = {
    name: 'bridge',
    sender: { tab: { id: 1 }, frameId: 0 },
    postMessage: (msg: any) => channel.port1.postMessage(msg),
    onMessage: { addListener: (cb: any) => bgHandlers.push(cb) },
    onDisconnect: { addListener: (_cb: any) => {} },
  };

  // Messages arriving on port1 from the client → Bridge handlers
  channel.port1.onmessage = (e) => bgHandlers.forEach(cb => cb(e.data));

  // Trigger Bridge's onConnect (simulates the Service Worker receiving a port)
  onConnectListeners[0]!(bridgePort);

  // 3. Connector simulator: respond to bridge:connect with bridge:init + port2
  const connectorSim = (event: MessageEvent) => {
    if (event.data?.type !== 'bridge:connect') return;
    window.removeEventListener('message', connectorSim);
    queueMicrotask(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'bridge:init', port: channel.port2 },
          source: window,
        }),
      );
    });
  };
  window.addEventListener('message', connectorSim);

  const client = createClient<typeof router>() as TestClient;
  await client.$waitForReady();
  return { client };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Bridge E2E', () => {
  let client: TestClient;

  beforeAll(async () => {
    ({ client } = await createInProcessClient());
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  test('query: echo returns the input', async () => {
    await expect(client.echo('hello')).resolves.toBe('hello');
  });

  test('mutation: add returns the sum', async () => {
    await expect(client.add({ a: 3, b: 4 })).resolves.toBe(7);
  });

  test('query: greet returns greeting', async () => {
    await expect(client.greet('World')).resolves.toBe('Hello, World!');
  });

  test('error: procedure errors are propagated', async () => {
    await expect(client.error()).rejects.toThrow('intentional error');
  });

  test('subscription: receives events', async () => {
    const received: number[] = [];
    const unsub = client.counter((n: number) => received.push(n));
    await new Promise(resolve => setTimeout(resolve, 350));
    unsub();
    expect(received.length).toBeGreaterThanOrEqual(3);
    expect(received[0]).toBe(1);
  });
});

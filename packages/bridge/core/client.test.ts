import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from './client';

describe('BridgeClient / createClient', () => {
  let channel: MessageChannel;
  let csPort: MessagePort;

  beforeEach(() => {
    channel = new MessageChannel();
    channel.port1.start();
    channel.port2.start();
    csPort = channel.port1;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('posts bridge:connect on construct', () => {
    const post = vi.spyOn(window, 'postMessage');
    createClient<typeof testRouter>({ timeout: 5000 });
    expect(post).toHaveBeenCalledWith(
      { type: 'bridge:connect' },
      '*',
    );
  });

  it('resolves $waitForReady when content script forwards port', async () => {
    const client = createClient<typeof testRouter>({ timeout: 5000 });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'bridge:init', port: channel.port2 },
        source: window,
      }),
    );

    await expect(client.$waitForReady()).resolves.toBeUndefined();
  });

  it('query resolves when port returns JSON-RPC result', async () => {
    const client = createClient<typeof testRouter>({ timeout: 5000 });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'bridge:init', port: channel.port2 },
        source: window,
      }),
    );
    await client.$waitForReady();

    csPort.onmessage = (ev: MessageEvent) => {
      const req = ev.data;
      if (req?.jsonrpc === '2.0' && req?.method === 'demo.echo') {
        csPort.postMessage({
          jsonrpc: '2.0',
          id: req.id,
          result: `echo:${req.params}`,
        });
      }
    };

    const out = await client.demo.echo.query('hi');
    expect(out).toBe('echo:hi');
  });

  it('query rejects on JSON-RPC error', async () => {
    const client = createClient<typeof testRouter>({ timeout: 5000 });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'bridge:init', port: channel.port2 },
        source: window,
      }),
    );
    await client.$waitForReady();

    csPort.onmessage = (ev: MessageEvent) => {
      const req = ev.data;
      if (req?.jsonrpc === '2.0') {
        csPort.postMessage({
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32000, message: 'boom' },
        });
      }
    };

    await expect(client.demo.echo.query('x')).rejects.toThrow('boom');
  });

  it('times out when no response', async () => {
    vi.useFakeTimers();
    const client = createClient<typeof testRouter>({ timeout: 100 });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'bridge:init', port: channel.port2 },
        source: window,
      }),
    );
    await client.$waitForReady();

    const p = client.demo.echo.query('slow');
    const assertion = expect(p).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });
});

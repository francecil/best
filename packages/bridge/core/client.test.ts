import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from './client';
import { BridgeError } from './error';
import { query } from './procedure';
import type { ProcedureRecord, Router } from './types';

const testRouter = {
  demo: {
    echo: query(async (x: string) => x),
  },
} satisfies Router;

type TestRouter = typeof testRouter;

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
    createClient<TestRouter>({ timeout: 5000 });
    expect(post).toHaveBeenCalledWith(
      { type: 'bridge:connect' },
      window.location.origin,
    );
  });

  it('resolves $waitForReady when content script forwards port', async () => {
    const client = createClient<TestRouter>({ timeout: 5000 });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'bridge:init', port: channel.port2 },
        source: window,
      }),
    );

    await expect(client.$waitForReady()).resolves.toBeUndefined();
  });

  it('query resolves when port returns JSON-RPC result', async () => {
    const client = createClient<TestRouter>({ timeout: 5000 });

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

    const out = await client.demo.echo('hi');
    expect(out).toBe('echo:hi');
  });

  it('query rejects on JSON-RPC error', async () => {
    const client = createClient<TestRouter>({ timeout: 5000 });

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

    await expect(client.demo.echo('x')).rejects.toThrow('boom');
  });

  it('query rejects with BridgeError on JSON-RPC error', async () => {
    const client = createClient<TestRouter>({ timeout: 5000 });

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
          error: { code: -32001, message: 'unauthorized', data: 'need login' },
        });
      }
    };

    const err = await client.demo.echo('x').catch(e => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe(-32001);
    expect((err as BridgeError).data).toBe('need login');
  });

  it('times out when no response', async () => {
    vi.useFakeTimers();
    const client = createClient<TestRouter>({ timeout: 100 });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'bridge:init', port: channel.port2 },
        source: window,
      }),
    );
    await client.$waitForReady();

    const p = client.demo.echo('slow');
    const assertion = expect(p).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });
});

// ─── Client middleware pipeline ───────────────────────────────────────────────

describe('client middleware pipeline (via ClientOptions)', () => {
  let channel: MessageChannel;
  let csPort: MessagePort;

  function initClient<T extends ProcedureRecord>(options: Parameters<typeof createClient>[0]) {
    const client = createClient<T>(options);
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'bridge:init', port: channel.port2 },
        source: window,
      }),
    );
    return client;
  }

  beforeEach(() => {
    channel = new MessageChannel();
    channel.port1.start();
    channel.port2.start();
    csPort = channel.port1;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries on failure and succeeds on a later attempt', async () => {
    let attempts = 0;
    const client = initClient<TestRouter>({ timeout: 5000, retry: { attempts: 2, delay: 10 } });
    await client.$waitForReady();

    csPort.onmessage = (ev: MessageEvent) => {
      const req = ev.data;
      attempts++;
      csPort.postMessage(
        attempts < 3
          ? { jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'transient' } }
          : { jsonrpc: '2.0', id: req.id, result: 'ok' },
      );
    };

    const p = client.demo.echo('hi');
    await vi.runAllTimersAsync();
    expect(await p).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('throws after exhausting retry attempts', async () => {
    const client = initClient<TestRouter>({ timeout: 5000, retry: { attempts: 1, delay: 10 } });
    await client.$waitForReady();

    csPort.onmessage = (ev: MessageEvent) => {
      const req = ev.data;
      csPort.postMessage({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'always fails' } });
    };

    const p = client.demo.echo('x');
    const assertion = expect(p).rejects.toThrow('always fails');
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('does not retry when retry.attempts = 0 (default)', async () => {
    let attempts = 0;
    const client = initClient<TestRouter>({ timeout: 5000 });
    await client.$waitForReady();

    csPort.onmessage = (ev: MessageEvent) => {
      const req = ev.data;
      attempts++;
      csPort.postMessage({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'fail' } });
    };

    await expect(client.demo.echo('x')).rejects.toThrow('fail');
    expect(attempts).toBe(1);
  });

  it('enables logger middleware via logger option', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const client = initClient<TestRouter>({ timeout: 5000, logger: true });
    await client.$waitForReady();

    csPort.onmessage = (ev: MessageEvent) => {
      const req = ev.data;
      csPort.postMessage({ jsonrpc: '2.0', id: req.id, result: 'pong' });
    };

    await client.demo.echo('ping');

    const logOutput = debugSpy.mock.calls.flat().join(' ');
    expect(logOutput).toContain('demo.echo');
  });

  it('logger uses console.info when level is "info"', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const client = initClient<TestRouter>({ timeout: 5000, logger: { level: 'info' } });
    await client.$waitForReady();

    csPort.onmessage = (ev: MessageEvent) => {
      const req = ev.data;
      csPort.postMessage({ jsonrpc: '2.0', id: req.id, result: 'ok' });
    };

    await client.demo.echo('test');
    expect(infoSpy).toHaveBeenCalled();
  });
});

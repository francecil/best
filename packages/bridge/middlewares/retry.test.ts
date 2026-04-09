import type { Router } from '../core/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from '../core/procedure';
import { retry } from './retry';
import { echoRouter, flush, setupBridge } from './test-utils';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('retry()', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('passes through when the procedure succeeds on the first attempt', async () => {
    const mw = retry({ attempts: 3, delay: 100 });
    const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
    await vi.runAllTimersAsync();
    await flush();

    const response = mockPort.postMessage.mock.calls.find((args) => args[0].id === 1);
    expect(response![0].result).toBe('hi');
  });

  it('retries and succeeds on a later attempt', async () => {
    let calls = 0;
    const router: Router = {
      flaky: query(async () => {
        calls++;
        if (calls < 3) throw new Error('not yet');
        return 'ok';
      }),
    };
    const mw = retry({ attempts: 3, delay: 50 });
    const { sendFromPage, mockPort } = setupBridge(router, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'flaky' });
    await vi.runAllTimersAsync();
    await flush();

    expect(calls).toBe(3);
    const response = mockPort.postMessage.mock.calls.find((args) => args[0].id === 1);
    expect(response![0].result).toBe('ok');
  });

  it('sends an error response after exhausting all attempts', async () => {
    const router: Router = {
      fail: query(async () => { throw new Error('always fails'); }),
    };
    const mw = retry({ attempts: 2, delay: 50 });
    const { sendFromPage, mockPort } = setupBridge(router, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'fail' });
    await vi.runAllTimersAsync();
    await flush();

    const response = mockPort.postMessage.mock.calls.find(
      (args) => args[0].id === 1 && 'error' in args[0],
    );
    expect(response).toBeDefined();
  });

  it('does not retry when attempts = 0', async () => {
    let calls = 0;
    const router: Router = {
      fail: query(async () => { calls++; throw new Error('boom'); }),
    };
    const mw = retry({ attempts: 0, delay: 100 });
    const { sendFromPage, mockPort } = setupBridge(router, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'fail' });
    await vi.runAllTimersAsync();
    await flush();

    expect(calls).toBe(1);
    const response = mockPort.postMessage.mock.calls.find(
      (args) => args[0].id === 1 && 'error' in args[0],
    );
    expect(response).toBeDefined();
  });

  it('uses exponential backoff delays', async () => {
    const delays: number[] = [];
    // Capture BEFORE spying to avoid infinite recursion
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: any, ms?: number) => {
      if (ms !== undefined && ms > 0) delays.push(ms);
      return originalSetTimeout(fn, 0) as any;
    });

    let calls = 0;
    const router: Router = {
      flaky: query(async () => {
        calls++;
        if (calls < 3) throw new Error('fail');
        return 'ok';
      }),
    };
    const mw = retry({ attempts: 2, delay: 100, backoff: 'exponential' });
    const { sendFromPage } = setupBridge(router, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'flaky' });
    await vi.runAllTimersAsync();
    await flush();

    expect(delays[0]).toBe(100); // 100 * 2^0
    expect(delays[1]).toBe(200); // 100 * 2^1
  });

  it('uses linear backoff delays', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: any, ms?: number) => {
      if (ms !== undefined && ms > 0) delays.push(ms);
      return originalSetTimeout(fn, 0) as any;
    });

    let calls = 0;
    const router: Router = {
      flaky: query(async () => {
        calls++;
        if (calls < 3) throw new Error('fail');
        return 'ok';
      }),
    };
    const mw = retry({ attempts: 2, delay: 100, backoff: 'linear' });
    const { sendFromPage } = setupBridge(router, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'flaky' });
    await vi.runAllTimersAsync();
    await flush();

    expect(delays[0]).toBe(100); // 100 * 1
    expect(delays[1]).toBe(200); // 100 * 2
  });

  it('uses constant delay when no backoff is set', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: any, ms?: number) => {
      if (ms !== undefined && ms > 0) delays.push(ms);
      return originalSetTimeout(fn, 0) as any;
    });

    let calls = 0;
    const router: Router = {
      flaky: query(async () => {
        calls++;
        if (calls < 3) throw new Error('fail');
        return 'ok';
      }),
    };
    const mw = retry({ attempts: 2, delay: 150 });
    const { sendFromPage } = setupBridge(router, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'flaky' });
    await vi.runAllTimersAsync();
    await flush();

    expect(delays[0]).toBe(150);
    expect(delays[1]).toBe(150);
  });
});

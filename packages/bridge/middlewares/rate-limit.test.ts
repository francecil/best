import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonRpcErrorCode } from '../core/types';
import { rateLimit } from './rate-limit';
import { echoRouter, flush, setupBridge } from './test-utils';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('rateLimit()', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('allows requests within the limit', async () => {
    const mw = rateLimit({ window: 1000, max: 3 });
    const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw]);

    for (let i = 1; i <= 3; i++) {
      sendFromPage({ jsonrpc: '2.0', id: i, method: 'echo', params: 'hi' });
    }
    await flush();

    const errors = mockPort.postMessage.mock.calls.filter((args) => 'error' in args[0]);
    expect(errors).toHaveLength(0);
  });

  it('blocks the request that exceeds the limit', async () => {
    const mw = rateLimit({ window: 1000, max: 2 });
    const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw]);

    for (let i = 1; i <= 3; i++) {
      sendFromPage({ jsonrpc: '2.0', id: i, method: 'echo', params: 'hi' });
    }
    await flush();

    const errors = mockPort.postMessage.mock.calls.filter((args) => 'error' in args[0]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]![0].error.code).toBe(JsonRpcErrorCode.Forbidden);
  });

  it('resets after the window expires', async () => {
    const mw = rateLimit({ window: 1000, max: 1 });
    const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
    await flush();

    vi.advanceTimersByTime(1001);
    mockPort.postMessage.mockClear();

    sendFromPage({ jsonrpc: '2.0', id: 2, method: 'echo', params: 'hi' });
    await flush();

    const errors = mockPort.postMessage.mock.calls.filter((args) => 'error' in args[0]);
    expect(errors).toHaveLength(0);
  });

  it('tracks limits per origin independently', async () => {
    const mw = rateLimit({ window: 1000, max: 1 });

    // First origin hits its limit
    const { sendFromPage: sendA, mockPort: portA } = setupBridge(echoRouter, [mw], 'https://a.com');
    sendA({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
    sendA({ jsonrpc: '2.0', id: 2, method: 'echo', params: 'hi' });
    await flush();

    const errorsA = portA.postMessage.mock.calls.filter((args) => 'error' in args[0]);
    expect(errorsA.length).toBeGreaterThan(0);

    // Second origin is independent — should still be within limit
    const { sendFromPage: sendB, mockPort: portB } = setupBridge(echoRouter, [mw], 'https://b.com');
    sendB({ jsonrpc: '2.0', id: 3, method: 'echo', params: 'hi' });
    await flush();

    const errorsB = portB.postMessage.mock.calls.filter((args) => 'error' in args[0]);
    expect(errorsB).toHaveLength(0);
  });
});

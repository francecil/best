import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonRpcErrorCode } from '../core/types';
import { validateOrigin } from './validate-origin';
import { echoRouter, flush, setupBridge } from './test-utils';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('validateOrigin()', () => {
  it('allows requests from an allowed origin', async () => {
    const mw = validateOrigin(['https://example.com']);
    const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw], 'https://example.com');

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
    await flush();

    const response = mockPort.postMessage.mock.calls.find((args) => args[0].id === 1);
    expect(response![0]).toHaveProperty('result');
  });

  it('allows requests matching an origin prefix', async () => {
    const mw = validateOrigin(['https://example.com']);
    const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw], 'https://example.com');

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
    await flush();

    const errors = mockPort.postMessage.mock.calls.filter((args) => 'error' in args[0]);
    expect(errors).toHaveLength(0);
  });

  it('blocks requests from a disallowed origin', async () => {
    const mw = validateOrigin(['https://allowed.com']);
    const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw], 'https://evil.com');

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
    await flush();

    const response = mockPort.postMessage.mock.calls.find((args) => args[0].id === 1);
    expect(response![0].error.code).toBe(JsonRpcErrorCode.Forbidden);
  });

  it('sends Forbidden when multiple origins are configured and none match', async () => {
    const mw = validateOrigin(['https://a.com', 'https://b.com']);
    const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw], 'https://evil.com');

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
    await flush();

    const response = mockPort.postMessage.mock.calls.find((args) => args[0].id === 1);
    expect(response![0].error.code).toBe(JsonRpcErrorCode.Forbidden);
  });

  it('allows when one of multiple origins matches', async () => {
    const mw = validateOrigin(['https://a.com', 'https://b.com']);
    const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw], 'https://b.com');

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
    await flush();

    const errors = mockPort.postMessage.mock.calls.filter((args) => 'error' in args[0]);
    expect(errors).toHaveLength(0);
  });
});

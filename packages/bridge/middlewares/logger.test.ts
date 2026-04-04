import type { Router } from '../core/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { query } from '../core/procedure';
import { createLoggerMiddleware } from './logger';
import { echoRouter, flush, setupBridge } from './test-utils';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createLoggerMiddleware()', () => {
  it('logs the request and response with console.debug by default', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const mw = createLoggerMiddleware();
    const { sendFromPage } = setupBridge(echoRouter, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
    await flush();

    expect(debugSpy).toHaveBeenCalledTimes(2); // once for request, once for response
    debugSpy.mockRestore();
  });

  it('uses console.info when level is "info"', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const mw = createLoggerMiddleware({ level: 'info' });
    const { sendFromPage } = setupBridge(echoRouter, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
    await flush();

    expect(infoSpy).toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
    infoSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('logs errors with console.error and re-throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mw = createLoggerMiddleware();
    const failRouter: Router = {
      fail: query(async () => { throw new Error('boom'); }),
    };
    const { sendFromPage, mockPort } = setupBridge(failRouter, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'fail' });
    await flush();

    expect(errorSpy).toHaveBeenCalled();
    const errResp = mockPort.postMessage.mock.calls.find(
      (args) => args[0].id === 1 && 'error' in args[0],
    );
    expect(errResp).toBeDefined();
    errorSpy.mockRestore();
  });

  it('includes the method name in log output', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const mw = createLoggerMiddleware();
    const { sendFromPage } = setupBridge(echoRouter, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'test' });
    await flush();

    const allArgs = debugSpy.mock.calls.flat().join(' ');
    expect(allArgs).toContain('echo');
    debugSpy.mockRestore();
  });
});

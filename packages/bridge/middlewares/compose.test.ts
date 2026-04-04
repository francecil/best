/**
 * Tests for the Koa-style middleware compose system in Bridge.
 * These test the dispatch/onion mechanics, not any specific built-in middleware.
 */

import type { Middleware, Router } from '../core/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bridge } from '../core/bridge';
import { BridgeError } from '../core/error';
import { query } from '../core/procedure';
import { JsonRpcErrorCode } from '../core/types';
import { echoRouter, flush, setupBridge } from './test-utils';

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── use() ────────────────────────────────────────────────────────────────────

describe('bridge.use()', () => {
  it('is chainable', () => {
    vi.stubGlobal('chrome', {
      runtime: { onConnect: { addListener: vi.fn() } },
    } as unknown as typeof chrome);

    const bridge = new Bridge(echoRouter);
    const mw: Middleware = async (_ctx, next) => next();
    expect(bridge.use(mw)).toBe(bridge);
  });
});

// ─── Before next() ────────────────────────────────────────────────────────────

describe('code before next()', () => {
  it('runs before the procedure', async () => {
    const log: string[] = [];
    const mw: Middleware = async (ctx, next) => {
      log.push(`before:${ctx.req.method}`);
      await next();
      log.push(`after:${ctx.req.method}`);
    };
    const { sendFromPage } = setupBridge(echoRouter, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hello' });
    await flush();

    expect(log).toEqual(['before:echo', 'after:echo']);
  });

  it('can mutate ctx.req to change the input', async () => {
    const mw: Middleware = async (ctx, next) => {
      ctx.req = { ...ctx.req, params: 'mutated' };
      await next();
    };
    const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'original' });
    await flush();

    const response = mockPort.postMessage.mock.calls.find(
      (args) => args[0].id === 1 && 'result' in args[0],
    );
    expect(response![0].result).toBe('mutated');
  });

  it('throwing before next() sends an error response and skips the procedure', async () => {
    const mw: Middleware = async (_ctx, _next) => {
      throw new BridgeError(JsonRpcErrorCode.Forbidden, 'blocked');
    };
    const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
    await flush();

    const errResp = mockPort.postMessage.mock.calls.find(
      (args) => args[0].id === 1 && 'error' in args[0],
    );
    expect(errResp![0].error.code).toBe(JsonRpcErrorCode.Forbidden);
    expect(errResp![0].error.message).toBe('blocked');
  });

  it('not calling next() prevents the procedure from running', async () => {
    const procedureSpy = vi.fn(async (input: string) => input);
    const router: Router = { echo: query(procedureSpy) };

    const mw: Middleware = async (_ctx, _next) => { /* gate — skip next() */ };
    const { sendFromPage, mockPort } = setupBridge(router, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
    await flush();

    expect(procedureSpy).not.toHaveBeenCalled();
    expect(mockPort.postMessage.mock.calls).toHaveLength(0);
  });
});

// ─── After next() ─────────────────────────────────────────────────────────────

describe('code after next()', () => {
  it('can read ctx.res after the procedure', async () => {
    const afterSpy = vi.fn();
    const mw: Middleware = async (ctx, next) => {
      await next();
      afterSpy(ctx.res);
    };
    const { sendFromPage } = setupBridge(echoRouter, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
    await flush();

    expect(afterSpy).toHaveBeenCalledOnce();
    expect(afterSpy.mock.calls[0][0]).toMatchObject({ result: 'hi' });
  });

  it('can mutate ctx.res to override the response', async () => {
    const mw: Middleware = async (ctx, next) => {
      await next();
      if (ctx.res && 'result' in ctx.res) {
        ctx.res = { ...ctx.res, result: 'overridden' };
      }
    };
    const { sendFromPage, mockPort } = setupBridge(echoRouter, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
    await flush();

    const response = mockPort.postMessage.mock.calls.find(
      (args) => args[0].id === 1 && 'result' in args[0],
    );
    expect(response![0].result).toBe('overridden');
  });

  it('does not run when the procedure throws (unless caught)', async () => {
    const afterSpy = vi.fn();
    const mw: Middleware = async (_ctx, next) => {
      await next();
      afterSpy();
    };
    const failRouter: Router = { fail: query(async () => { throw new Error('boom'); }) };
    const { sendFromPage } = setupBridge(failRouter, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'fail' });
    await flush();

    expect(afterSpy).not.toHaveBeenCalled();
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('error handling via try/catch around next()', () => {
  it('catches errors from the procedure', async () => {
    const caughtErrors: Error[] = [];
    const mw: Middleware = async (ctx, next) => {
      try {
        await next();
      }
      catch (err) {
        caughtErrors.push(err as Error);
        throw err;
      }
    };
    const failRouter: Router = { fail: query(async () => { throw new Error('boom'); }) };
    const { sendFromPage, mockPort } = setupBridge(failRouter, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'fail' });
    await flush();

    expect(caughtErrors[0]!.message).toBe('boom');
    expect(mockPort.postMessage.mock.calls.find(
      (args) => args[0].id === 1 && 'error' in args[0],
    )).toBeDefined();
  });

  it('can suppress errors by setting a fallback ctx.res', async () => {
    const mw: Middleware = async (ctx, next) => {
      try {
        await next();
      }
      catch {
        ctx.res = { jsonrpc: '2.0', id: ctx.req.id, result: 'fallback' };
      }
    };
    const failRouter: Router = { fail: query(async () => { throw new Error('boom'); }) };
    const { sendFromPage, mockPort } = setupBridge(failRouter, [mw]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'fail' });
    await flush();

    const response = mockPort.postMessage.mock.calls.find((args) => args[0].id === 1);
    expect(response![0].result).toBe('fallback');
  });
});

// ─── Onion order ─────────────────────────────────────────────────────────────

describe('onion execution order', () => {
  it('outer-before → inner-before → procedure → inner-after → outer-after', async () => {
    const log: string[] = [];

    const outer: Middleware = async (_ctx, next) => {
      log.push('outer:before');
      await next();
      log.push('outer:after');
    };
    const inner: Middleware = async (_ctx, next) => {
      log.push('inner:before');
      await next();
      log.push('inner:after');
    };

    const router: Router = {
      echo: query(async (v: string) => { log.push('procedure'); return v; }),
    };
    const { sendFromPage } = setupBridge(router, [outer, inner]);

    sendFromPage({ jsonrpc: '2.0', id: 1, method: 'echo', params: 'hi' });
    await flush();

    expect(log).toEqual([
      'outer:before',
      'inner:before',
      'procedure',
      'inner:after',
      'outer:after',
    ]);
  });
});

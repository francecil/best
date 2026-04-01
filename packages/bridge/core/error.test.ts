import { describe, expect, it } from 'vitest';
import { BridgeError } from './error';
import { JsonRpcErrorCode } from './types';

describe('BridgeError', () => {
  it('is an instance of Error', () => {
    const err = new BridgeError(JsonRpcErrorCode.InternalError, 'oops');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BridgeError);
  });

  it('stores code and message', () => {
    const err = new BridgeError(JsonRpcErrorCode.MethodNotFound, 'not found');
    expect(err.code).toBe(JsonRpcErrorCode.MethodNotFound);
    expect(err.message).toBe('not found');
    expect(err.name).toBe('BridgeError');
  });

  it('stores optional data', () => {
    const err = new BridgeError(JsonRpcErrorCode.InternalError, 'bad', { detail: 42 });
    expect(err.data).toEqual({ detail: 42 });
  });

  it('data is undefined when not provided', () => {
    const err = new BridgeError(JsonRpcErrorCode.InternalError, 'bad');
    expect(err.data).toBeUndefined();
  });

  it('toJSON returns correct shape', () => {
    const err = new BridgeError(-32601, 'method not found', 'extra');
    expect(err.toJSON()).toEqual({
      code: -32601,
      message: 'method not found',
      data: 'extra',
    });
  });

  it('fromResponse reconstructs a BridgeError', () => {
    const err = BridgeError.fromResponse({ code: -32001, message: 'unauthorized', data: null });
    expect(err).toBeInstanceOf(BridgeError);
    expect(err.code).toBe(-32001);
    expect(err.message).toBe('unauthorized');
    expect(err.data).toBeNull();
  });
});

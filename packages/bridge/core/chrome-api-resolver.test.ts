import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeError } from './error';
import { callChromeApi, isChromeApiAllowed, resolveChromeApi } from './chrome-api-resolver';
import { JsonRpcErrorCode } from './types';

describe('isChromeApiAllowed', () => {
  it('returns false when config is undefined', () => {
    expect(isChromeApiAllowed('bookmarks.getTree', undefined)).toBe(false);
  });

  it('returns false when config is false', () => {
    expect(isChromeApiAllowed('bookmarks.getTree', false)).toBe(false);
  });

  it('returns false for empty string path', () => {
    expect(isChromeApiAllowed('', true)).toBe(false);
    expect(isChromeApiAllowed('', ['bookmarks'])).toBe(false);
  });

  it('returns true when config is true', () => {
    expect(isChromeApiAllowed('bookmarks.getTree', true)).toBe(true);
    expect(isChromeApiAllowed('anything.method', true)).toBe(true);
  });

  it('checks namespace against allowlist array', () => {
    const config = ['bookmarks', 'history'];
    expect(isChromeApiAllowed('bookmarks.getTree', config)).toBe(true);
    expect(isChromeApiAllowed('history.search', config)).toBe(true);
    expect(isChromeApiAllowed('tabs.query', config)).toBe(false);
    expect(isChromeApiAllowed('storage.local.get', config)).toBe(false);
  });
});

describe('resolveChromeApi', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      bookmarks: {
        getTree: vi.fn(async () => [{ id: '0', title: '' }]),
        search: vi.fn(async () => []),
        onCreated: { addListener: vi.fn() },
      },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves a simple 2-segment path to a bound function', () => {
    const fn = resolveChromeApi('bookmarks.getTree');
    expect(fn).toBeTypeOf('function');
  });

  it('resolves a nested 3-segment path', () => {
    const fn = resolveChromeApi('storage.local.get');
    expect(fn).toBeTypeOf('function');
  });

  it('returns null for single-segment paths', () => {
    expect(resolveChromeApi('bookmarks')).toBeNull();
  });

  it('returns null when namespace does not exist on chrome', () => {
    expect(resolveChromeApi('nonexistent.method')).toBeNull();
  });

  it('returns null when path resolves to a non-function, non-event property', () => {
    // Add a non-function property to the mock
    (globalThis as any).chrome.bookmarks.count = 5;
    expect(resolveChromeApi('bookmarks.count')).toBeNull();
  });

  it('throws Forbidden for __proto__ segment', () => {
    expect(() => resolveChromeApi('bookmarks.__proto__')).toThrow(BridgeError);
    expect(() => resolveChromeApi('bookmarks.__proto__')).toThrow('Forbidden path segment');
  });

  it('throws Forbidden for constructor segment', () => {
    expect(() => resolveChromeApi('constructor.method')).toThrow(BridgeError);
  });

  it('throws Forbidden for prototype segment', () => {
    expect(() => resolveChromeApi('bookmarks.prototype')).toThrow(BridgeError);
  });

  it('throws Forbidden for event listener properties (onXxx)', () => {
    expect(() => resolveChromeApi('bookmarks.onCreated')).toThrow(BridgeError);
    const err = (() => {
      try { resolveChromeApi('bookmarks.onCreated'); }
      catch (e) { return e as BridgeError; }
    })()!;
    expect(err.code).toBe(JsonRpcErrorCode.Forbidden);
    expect(err.message).toContain('event segment');
  });

  it('returns null when chrome global is unavailable', () => {
    vi.stubGlobal('chrome', undefined);
    expect(resolveChromeApi('bookmarks.getTree')).toBeNull();
  });

  it('returns null for empty string path', () => {
    expect(resolveChromeApi('')).toBeNull();
  });

  it('returns null for paths exceeding 256 characters', () => {
    expect(resolveChromeApi('a.'.repeat(129))).toBeNull();
  });

  it('throws Forbidden for event segment in an intermediate position', () => {
    expect(() => resolveChromeApi('bookmarks.onCreated.addListener')).toThrow(BridgeError);
    const err = (() => {
      try { resolveChromeApi('bookmarks.onCreated.addListener'); }
      catch (e) { return e as BridgeError; }
    })()!;
    expect(err.code).toBe(JsonRpcErrorCode.Forbidden);
    expect(err.message).toContain('event segment');
  });
});

describe('callChromeApi', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      bookmarks: {
        getTree: vi.fn(async () => [{ id: '0' }]),
        search: vi.fn(async (query: unknown) => [query]),
        create: vi.fn(async (parentId: unknown, title: unknown) => ({ id: '1', parentId, title })),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls with no args when params is undefined', async () => {
    const result = await callChromeApi('bookmarks.getTree', undefined);
    expect((globalThis as any).chrome.bookmarks.getTree).toHaveBeenCalledWith();
    expect(result).toEqual([{ id: '0' }]);
  });

  it('calls with no args when params is null', async () => {
    await callChromeApi('bookmarks.getTree', null);
    expect((globalThis as any).chrome.bookmarks.getTree).toHaveBeenCalledWith();
  });

  it('passes a single object param directly', async () => {
    await callChromeApi('bookmarks.search', { query: 'test' });
    expect((globalThis as any).chrome.bookmarks.search).toHaveBeenCalledWith({ query: 'test' });
  });

  it('spreads array params as positional arguments', async () => {
    await callChromeApi('bookmarks.create', ['parentId', 'My Bookmark']);
    expect((globalThis as any).chrome.bookmarks.create).toHaveBeenCalledWith('parentId', 'My Bookmark');
  });

  it('throws MethodNotFound for unresolvable path', async () => {
    await expect(callChromeApi('nonexistent.method', undefined)).rejects.toThrow(BridgeError);
    await expect(callChromeApi('nonexistent.method', undefined)).rejects.toMatchObject({
      code: JsonRpcErrorCode.MethodNotFound,
    });
  });
});

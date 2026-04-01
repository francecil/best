import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { networkProcedures } from './network';

describe('networkProcedures', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetchResponse(opts: {
    ok?: boolean;
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    body?: string;
  }) {
    const { ok = true, status = 200, statusText = 'OK', headers = {}, body = '' } = opts;
    const headerMap = new Map(Object.entries(headers));

    vi.mocked(fetch).mockResolvedValue({
      ok,
      status,
      statusText,
      headers: {
        forEach: (cb: (value: string, key: string) => void) => {
          headerMap.forEach((v, k) => cb(v, k));
        },
        get: (key: string) => headerMap.get(key) ?? null,
      },
      text: async () => body,
    } as unknown as Response);
  }

  it('makes a GET request and returns structured response', async () => {
    mockFetchResponse({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    });

    const result = await networkProcedures.fetch.handler({
      url: 'https://api.example.com/data',
    });

    expect(fetch).toHaveBeenCalledWith('https://api.example.com/data', {
      method: 'GET',
      headers: undefined,
      body: undefined,
    });
    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.body).toBe('{"ok":true}');
    expect(result.headers['content-type']).toBe('application/json');
  });

  it('forwards method, headers, and body', async () => {
    mockFetchResponse({ status: 201, body: '{}' });

    await networkProcedures.fetch.handler({
      url: 'https://api.example.com/items',
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
      body: '{"name":"test"}',
    });

    expect(fetch).toHaveBeenCalledWith('https://api.example.com/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
      body: '{"name":"test"}',
    });
  });

  it('returns ok: false for non-2xx responses', async () => {
    mockFetchResponse({ ok: false, status: 404, statusText: 'Not Found', body: 'not found' });

    const result = await networkProcedures.fetch.handler({ url: 'https://example.com/missing' });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.body).toBe('not found');
  });

  it('passes null body as undefined to fetch', async () => {
    mockFetchResponse({});

    await networkProcedures.fetch.handler({ url: 'https://example.com', body: null });

    expect(fetch).toHaveBeenCalledWith('https://example.com', expect.objectContaining({
      body: undefined,
    }));
  });
});

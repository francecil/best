import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeError } from '../core/error';
import { JsonRpcErrorCode } from '../core/types';
import { resourcesProcedures } from './resources';

describe('resourcesProcedures', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://testid/${path}`),
      },
    });
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('btoa', (str: string) => Buffer.from(str, 'binary').toString('base64'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getUrl', () => {
    it('returns the chrome-extension:// URL for the given path', () => {
      const url = resourcesProcedures.getUrl.handler('icons/icon-48.png');
      expect(url).toBe('chrome-extension://testid/icons/icon-48.png');
      expect((globalThis as any).chrome.runtime.getURL).toHaveBeenCalledWith('icons/icon-48.png');
    });
  });

  describe('fetch', () => {
    function mockFetchResponse(opts: {
      ok?: boolean;
      status?: number;
      contentType?: string;
      data?: Uint8Array;
    }) {
      const { ok = true, status = 200, contentType = 'image/png', data = new Uint8Array([1, 2, 3]) } = opts;
      vi.mocked(fetch).mockResolvedValue({
        ok,
        status,
        headers: {
          get: (key: string) => key === 'content-type' ? contentType : null,
        },
        arrayBuffer: async () => data.buffer,
      } as unknown as Response);
    }

    it('fetches resource and returns base64 data URL', async () => {
      mockFetchResponse({ contentType: 'image/png', data: new Uint8Array([137, 80, 78, 71]) });

      const result = await resourcesProcedures.fetch.handler('icons/icon-48.png');

      expect(fetch).toHaveBeenCalledWith('chrome-extension://testid/icons/icon-48.png');
      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it('uses application/octet-stream when no content-type header', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array([0]).buffer,
      } as unknown as Response);

      const result = await resourcesProcedures.fetch.handler('file.bin');
      expect(result).toMatch(/^data:application\/octet-stream;base64,/);
    });

    it('throws NotFound BridgeError when resource does not exist', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Response);

      await expect(resourcesProcedures.fetch.handler('missing.png')).rejects.toThrow(BridgeError);
      await expect(resourcesProcedures.fetch.handler('missing.png')).rejects.toMatchObject({
        code: JsonRpcErrorCode.NotFound,
      });
    });

    it('includes the path and status in the error message', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 403,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Response);

      const err = await resourcesProcedures.fetch.handler('private.png').catch(e => e);
      expect(err.message).toContain('private.png');
      expect(err.message).toContain('403');
    });

    it('routes chrome:// URLs through offscreen (does not call fetch directly)', async () => {
      // chrome:// URLs cannot be fetched from a service worker; they are
      // delegated to fetchDataUrlViaOffscreen which uses chrome.offscreen API.
      const offscreenDataUrl = 'data:image/png;base64,abc123==';
      (globalThis as any).chrome.offscreen = {
        createDocument: vi.fn().mockResolvedValue(undefined),
        Reason: { BLOBS: 'BLOBS' },
      };
      (globalThis as any).chrome.runtime.sendMessage = vi.fn((_msg: unknown, cb: (r: unknown) => void) => {
        cb({ dataUrl: offscreenDataUrl });
      });

      const result = await resourcesProcedures.fetch.handler('chrome://extension-icon/abc/48/0');

      expect(result).toBe(offscreenDataUrl);
      expect(fetch).not.toHaveBeenCalled();
      // getURL is called internally to resolve offscreen.html, but NOT with the icon path
      expect((globalThis as any).chrome.runtime.getURL).not.toHaveBeenCalledWith('chrome://extension-icon/abc/48/0');
    });

    it('uses absolute non-chrome URL directly without calling getURL', async () => {
      mockFetchResponse({ contentType: 'image/png', data: new Uint8Array([1, 2, 3]) });

      await resourcesProcedures.fetch.handler('https://example.com/icon.png');

      expect(fetch).toHaveBeenCalledWith('https://example.com/icon.png');
      expect((globalThis as any).chrome.runtime.getURL).not.toHaveBeenCalled();
    });

    it('resolves relative path via getURL', async () => {
      mockFetchResponse({ contentType: 'image/png', data: new Uint8Array([1, 2, 3]) });

      await resourcesProcedures.fetch.handler('icons/icon-48.png');

      expect((globalThis as any).chrome.runtime.getURL).toHaveBeenCalledWith('icons/icon-48.png');
      expect(fetch).toHaveBeenCalledWith('chrome-extension://testid/icons/icon-48.png');
    });
  });
});

/**
 * Extension Resource Procedures
 *
 * Allows web pages to access local extension assets (icons, images, etc.)
 * even when not declared as web_accessible_resources.
 *
 * For simple asset loading (icons, images), resources are fetched by the
 * service worker and returned as base64 data URLs.
 *
 * For use cases requiring DOM/Canvas operations (image resizing, format
 * conversion), consider using chrome.offscreen API in a custom procedure.
 */

import { fetchDataUrlViaOffscreen } from '../core/offscreen';
import { BridgeError } from '../core/error';
import { query } from '../core/procedure';
import { JsonRpcErrorCode } from '../core/types';

/**
 * Convert an ArrayBuffer to a base64 string in chunks to avoid
 * stack overflow on large buffers.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
}

export const resourcesProcedures = {
  /**
   * Get the full chrome-extension:// URL for a relative resource path.
   * The resource must be declared in web_accessible_resources in manifest.json
   * for the returned URL to be usable directly from a web page.
   *
   * @example
   * const url = await bridge.resources.getUrl('icons/icon-48.png')
   * // → "chrome-extension://extensionid/icons/icon-48.png"
   */
  getUrl: query((path: string) => {
    return chrome.runtime.getURL(path);
  }),

  /**
   * Fetch an extension resource and return it as a base64 data URL.
   *
   * Accepts either:
   * - A relative path → resolved via `chrome.runtime.getURL(path)` (local extension asset)
   * - An absolute URL → used directly (e.g. `chrome://extension-icon/...` for managed icons)
   *
   * All fetches run in the service worker context, bypassing web page restrictions.
   *
   * @example
   * // Local asset
   * const dataUrl = await bridge.resources.fetch('icons/icon-48.png')
   * // Managed icon from chrome.management API
   * const dataUrl = await bridge.resources.fetch(ext.icons[0].url)
   * img.src = dataUrl  // "data:image/png;base64,..."
   */
  fetch: query(async (pathOrUrl: string) => {
    const isAbsolute = /^[\w-]+:\/\//.test(pathOrUrl);
    const url = isAbsolute ? pathOrUrl : chrome.runtime.getURL(pathOrUrl);

    // chrome:// URLs (e.g. chrome://extension-icon/…) cannot be fetched from
    // a service worker — only a Blink rendering context can load them.
    if (/^chrome:\/\//.test(url)) {
      return fetchDataUrlViaOffscreen(url);
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new BridgeError(
        JsonRpcErrorCode.NotFound,
        `Resource not found: ${pathOrUrl} (${response.status})`,
      );
    }

    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    const buffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);

    return `data:${contentType};base64,${base64}`;
  }),
};

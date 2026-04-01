/**
 * Network Fetch Procedures
 *
 * Allows web pages to make HTTP requests via the browser extension,
 * bypassing CORS restrictions that apply to normal web page fetches.
 * Requires appropriate host_permissions in the extension manifest.
 */

import { mutation } from '../core/procedure';

export interface NetworkFetchRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** Request body as a string (JSON.stringify before passing if needed) */
  body?: string | null;
}

export interface NetworkFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  /** Response body as text */
  body: string;
}

export const networkProcedures = {
  /**
   * Make an HTTP request via the extension's fetch.
   * Bypasses CORS since requests originate from the service worker context.
   *
   * @example
   * const res = await bridge.network.fetch({ url: 'https://api.example.com/data' })
   * const data = JSON.parse(res.body)
   */
  fetch: mutation(async ({
    url,
    method = 'GET',
    headers,
    body = null,
  }: NetworkFetchRequest): Promise<NetworkFetchResponse> => {
    const response = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
    });

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: await response.text(),
    };
  }),
};

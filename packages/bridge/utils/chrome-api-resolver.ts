/**
 * Generic Chrome Extension API resolver.
 * Resolves a dot-separated method path (e.g. "bookmarks.getTree") to a
 * chrome.* function and invokes it with the provided params.
 */

import { BridgeError } from '../core/error';
import type { ChromeApiConfig } from '../core/types';
import { JsonRpcErrorCode } from '../core/types';

/** Path segments that must never appear (prototype pollution guard) */
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Returns true if `path`'s top-level namespace is permitted by `config`.
 *
 * NOTE: This only checks namespace membership against the allowlist.
 * Security validation (forbidden segments, event-listener paths) is enforced
 * separately by `resolveChromeApi`.
 */
export function isChromeApiAllowed(path: string, config: ChromeApiConfig | undefined): boolean {
  if (!config) return false;
  if (!path) return false;
  if (config === true) return true;
  const namespace = path.split('.')[0];
  return (config as string[]).includes(namespace!);
}

/**
 * Resolves a dot-separated path to a callable function on the chrome global.
 * Returns null when the path does not resolve to a function.
 * Throws BridgeError for security violations.
 */
export function resolveChromeApi(path: string): ((...args: unknown[]) => unknown) | null {
  if (!path || path.length > 256) return null;

  const segments = path.split('.');

  if (segments.length < 2) {
    return null;
  }

  for (const seg of segments) {
    if (FORBIDDEN_SEGMENTS.has(seg)) {
      throw new BridgeError(JsonRpcErrorCode.Forbidden, `Forbidden path segment: ${seg}`);
    }
    // Block event object segments anywhere in the path (e.g. onCreated, onChanged)
    if (seg.length > 2 && seg.startsWith('on') && seg[2] === seg[2]!.toUpperCase()) {
      throw new BridgeError(
        JsonRpcErrorCode.Forbidden,
        `Forbidden event segment in Chrome API path: ${seg}`,
      );
    }
  }

  // Walk the chrome object, tracking parent for correct `this` binding
  const chromeGlobal = (globalThis as any).chrome;
  if (!chromeGlobal) return null;

  let parent: any = null;
  let current: any = chromeGlobal;
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return null;
    parent = current;
    current = current[seg];
  }

  if (typeof current !== 'function') return null;

  return (current as Function).bind(parent);
}

/**
 * Calls a Chrome API by dot-separated path with the given params.
 * - Array params are spread as positional arguments
 * - undefined/null params call the function with no arguments
 * - Any other value is passed as a single argument
 */
export async function callChromeApi(path: string, params: unknown): Promise<unknown> {
  const fn = resolveChromeApi(path);

  if (!fn) {
    throw new BridgeError(
      JsonRpcErrorCode.MethodNotFound,
      `Chrome API not found: chrome.${path}`,
    );
  }

  if (Array.isArray(params)) {
    return await fn(...params);
  }
  if (params === undefined || params === null) {
    return await fn();
  }
  return await fn(params);
}

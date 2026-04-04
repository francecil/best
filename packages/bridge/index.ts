/**
 * Extension Bridge - Main Entry
 *
 * @example Service Worker
 * ```ts
 * import { createBridge, query, mutation } from 'extension-bridge'
 *
 * const bridge = createBridge({
 *   extensions: {
 *     getAll: query(async () => chrome.management.getAll())
 *   }
 * })
 *
 * bridge.listen()
 * ```
 *
 * @example Web Page
 * ```ts
 * import { createClient } from 'extension-bridge'
 * import type { AppBridge } from './background'
 *
 * const bridge = createClient<AppBridge>()
 * await bridge.$waitForReady()
 *
 * const extensions = await bridge.extensions.getAll()
 * await bridge.extensions.setEnabled({ id, enabled: true })
 * const unsub = bridge.extensions.onChanged((data) => console.log(data))
 * ```
 *
 * @example Content Script
 * ```ts
 * import { connectBridge } from 'extension-bridge'
 *
 * connectBridge({ debug: true })
 * ```
 */

export { connectBridge } from './connector';
// Core exports
export { createBridge } from './core/bridge';
export { registerOffscreenHandler } from './core/offscreen';
export * from './core/devtools';
// Re-export for convenience
export { createClient } from './core/client';
export { BridgeError } from './core/error';

export { mutation, query, subscription } from './core/procedure';
export type {
  AnyProcedure,
  BridgeContext,
  BridgeOptions,
  ChromeApiClient,
  ChromeApiConfig,
  DevToolsEvent,
  InferClient,
  Middleware,
  MiddlewareFn,
  Next,
  Procedure,
  ProcedureCallable,
  ProcedureType,
  Router,
  SubscriptionCallable,
} from './core/types';
export type { DefaultRouter } from './procedures';
export { JsonRpcErrorCode } from './core/types';

// Built-in middleware
export { createLoggerMiddleware, rateLimit, validateOrigin } from './middlewares/built-in';

// Retry utility
export { withRetry } from './middlewares/retry';
export type { RetryOptions } from './middlewares/retry';

// Built-in procedures
export * from './procedures';


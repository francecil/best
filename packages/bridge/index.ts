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
 * import { createClient } from 'extension-bridge/client'
 * import type { AppBridge } from './background'
 *
 * const bridge = createClient<AppBridge>()
 * await bridge.$waitForReady()
 *
 * const extensions = await bridge.extensions.getAll.query()
 * ```
 *
 * @example Content Script
 * ```ts
 * import { connectBridge } from 'extension-bridge/connector'
 *
 * connectBridge({ debug: true })
 * ```
 */

export { connectBridge } from './connector';
// Core exports
export { createBridge } from './core/bridge';
// Re-export for convenience
export { createClient } from './core/client';

export { mutation, query, subscription } from './core/procedure';
export type {
  AnyProcedure,
  BridgeOptions,
  Procedure,
  ProcedureType,
  Router,
} from './core/types';

// Built-in procedures
export { managementProcedures } from './procedures/management';
export { tabsProcedures } from './procedures/tabs';

/**
 * Example: Service Worker
 * Define your Bridge API here
 */

import { createBridge } from '../core/bridge';
import { managementProcedures, tabsProcedures } from '../procedures';

// Create bridge with built-in procedures
export const bridge = createBridge(
  {
    // Management API
    extensions: managementProcedures,

    // Tabs API
    tabs: tabsProcedures,

    // You can add custom procedures here
    // analytics: {
    //   track: mutation(async (event: string) => {
    //     // Custom logic
    //   })
    // }
  },
  {
    debug: true, // Enable debug logs
  },
);

// Export type for client
export type AppBridge = typeof bridge;

// Start listening
bridge.listen();

console.log('✅ Bridge initialized');

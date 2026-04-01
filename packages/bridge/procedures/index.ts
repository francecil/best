export * from './cookies';
export * from './management';
export * from './network';
export * from './notifications';
export * from './resources';
export * from './runtime';
export * from './storage';
export * from './tabs';

import { cookiesProcedures } from './cookies';
import { managementProcedures } from './management';
import { networkProcedures } from './network';
import { notificationsProcedures } from './notifications';
import { resourcesProcedures } from './resources';
import { runtimeProcedures } from './runtime';
import { storageProcedures } from './storage';
import { tabsProcedures } from './tabs';

/**
 * Pre-wired router with all built-in Chrome API procedures.
 * Use on the service worker side with `createBridge(defaultRouter)` and
 * on the client side with `createClient<DefaultRouter>()`.
 */
export const defaultRouter = {
  extensions: managementProcedures,
  tabs: tabsProcedures,
  storage: storageProcedures,
  cookies: cookiesProcedures,
  notifications: notificationsProcedures,
  runtime: runtimeProcedures,
  network: networkProcedures,
  resources: resourcesProcedures,
};

export type DefaultRouter = typeof defaultRouter;

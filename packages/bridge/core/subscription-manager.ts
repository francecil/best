import type {
  AnyProcedure,
  DevToolsEmit,
  JsonRpcNotification,
  SubscriptionCleanup,
  SubscriptionEmit,
} from './types';
import type { Logger } from '../utils/logger';

const MAX_SUBSCRIPTIONS_PER_PORT = 50;

interface SubEntry {
  cleanup: SubscriptionCleanup;
  path: string;
  tabId: number | undefined;
}

export class SubscriptionManager {
  private readonly subscriptions = new Map<chrome.runtime.Port, Map<string, SubEntry>>();
  private readonly logger: ReturnType<Logger>;
  private readonly onDevTools: DevToolsEmit | undefined;

  constructor(logger: ReturnType<Logger>, onDevTools?: DevToolsEmit) {
    this.logger = logger;
    this.onDevTools = onDevTools;
  }

  handle(path: string, procedure: AnyProcedure, port: chrome.runtime.Port): { subscriptionId: string } {
    const portSubs = this.subscriptions.get(port);
    if (portSubs && portSubs.size >= MAX_SUBSCRIPTIONS_PER_PORT) {
      throw new Error(`Subscription limit exceeded (max: ${MAX_SUBSCRIPTIONS_PER_PORT})`);
    }

    const subscriptionId = `${path}:${Date.now()}:${Math.random()}`;
    const tabId = port.sender?.tab?.id;
    this.logger.info(`Creating subscription: ${subscriptionId}`);

    const emit: SubscriptionEmit<unknown> = (data) => {
      const notification: JsonRpcNotification = {
        jsonrpc: '2.0',
        method: `$subscription:${subscriptionId}`,
        params: data,
      };
      port.postMessage(notification);
    };

    const handler = procedure.handler as (emit: SubscriptionEmit<unknown>) => SubscriptionCleanup;
    let cleanup: SubscriptionCleanup;
    try {
      cleanup = handler(emit);
    }
    catch (error) {
      this.logger.error(`Subscription setup failed: ${path}`, error);
      throw error;
    }

    if (!this.subscriptions.has(port)) {
      this.subscriptions.set(port, new Map());
    }
    this.subscriptions.get(port)!.set(subscriptionId, { cleanup, path, tabId });

    this.onDevTools?.(tabId, { type: 'subscribe', id: subscriptionId, path, data: null, timestamp: Date.now() });

    return { subscriptionId };
  }

  unsubscribe(subscriptionId: string) {
    this.logger.info(`Unsubscribing: ${subscriptionId}`);

    for (const [port, subs] of this.subscriptions.entries()) {
      const entry = subs.get(subscriptionId);
      if (entry) {
        entry.cleanup();
        subs.delete(subscriptionId);
        if (subs.size === 0) this.subscriptions.delete(port);
        this.onDevTools?.(entry.tabId, { type: 'unsubscribe', id: subscriptionId, path: entry.path, data: null, timestamp: Date.now() });
        break;
      }
    }
  }

  cleanup(port: chrome.runtime.Port) {
    const subs = this.subscriptions.get(port);
    if (!subs) return;

    this.logger.info(`Cleaning up ${subs.size} subscriptions for disconnected port`);
    for (const [subscriptionId, entry] of subs.entries()) {
      entry.cleanup();
      this.onDevTools?.(entry.tabId, { type: 'unsubscribe', id: subscriptionId, path: entry.path, data: null, timestamp: Date.now() });
    }
    this.subscriptions.delete(port);
  }
}

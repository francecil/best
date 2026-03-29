/**
 * Bridge Server (runs in Service Worker)
 */

import type {
  AnyProcedure,
  BridgeOptions,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  Router,
  SubscriptionCleanup,
  SubscriptionEmit,
} from './types';
import { createLogger } from './logger';
import { JsonRpcErrorCode } from './types';

export class Bridge<TRouter extends Router> {
  private router: TRouter;
  private subscriptions = new Map<chrome.runtime.Port, Map<string, SubscriptionCleanup>>();
  private logger: ReturnType<typeof createLogger>;
  private ports = new Set<chrome.runtime.Port>();
  private procedureCache = new Map<string, AnyProcedure | null>();
  private readonly MAX_SUBSCRIPTIONS_PER_PORT = 50;

  constructor(router: TRouter, options: BridgeOptions = {}) {
    this.router = router;
    this.logger = createLogger('Bridge', options.debug ?? false);
  }

  /**
   * Start listening for connections
   */
  listen() {
    this.logger.info('Bridge listening...');

    // Content script uses chrome.runtime.connect({ name: 'bridge' }) — register onConnect up front.
    // (The connector does not send runtime messages with type bridge:connect.)
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== 'bridge') {
        return;
      }

      const sender = port.sender;
      this.logger.info(
        `Port connected: ${port.name} (tab ${sender?.tab?.id}, frame ${sender?.frameId})`,
      );

      this.ports.add(port);

      port.onMessage.addListener((message) => {
        this.handleMessage(message, port);
      });

      port.onDisconnect.addListener(() => {
        this.logger.info('Port disconnected');
        this.ports.delete(port);
        this.cleanupSubscriptions(port);
      });

      port.postMessage({ type: 'bridge:ready' });
    });

    this.logger.success('Bridge ready');
  }

  /**
   * Handle incoming JSON-RPC message
   */
  private async handleMessage(
    message: JsonRpcRequest | JsonRpcNotification,
    port: chrome.runtime.Port,
  ) {
    // Handle subscription unsubscribe
    if (message.method?.startsWith('$unsubscribe:')) {
      const subscriptionId = message.method.replace('$unsubscribe:', '');
      this.unsubscribe(subscriptionId);
      return;
    }

    // Validate request
    if (!('id' in message)) {
      this.logger.warn('Received notification (no id), ignoring');
      return;
    }

    const request = message as JsonRpcRequest;

    try {
      this.logger.debug(`→ ${request.method}`, request.params);

      const result = await this.callProcedure(
        request.method,
        request.params,
        port,
      );

      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };

      port.postMessage(response);
      this.logger.debug(`← ${request.method}`, result);
    }
    catch (error) {
      this.logger.error(`✗ ${request.method}`, error);

      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: JsonRpcErrorCode.InternalError,
          message: error instanceof Error ? error.message : String(error),
          data: error,
        },
      };

      port.postMessage(response);
    }
  }

  /**
   * Call a procedure by path
   */
  private async callProcedure(
    path: string,
    params: unknown,
    port: chrome.runtime.Port,
  ): Promise<unknown> {
    const procedure = this.resolveProcedure(path);

    if (!procedure) {
      throw new Error(`Procedure not found: ${path}`);
    }

    // Handle subscription
    if (procedure._meta.type === 'subscription') {
      return this.handleSubscription(path, procedure, port);
    }

    // Handle query/mutation
    const handler = procedure.handler as (input: unknown) => Promise<unknown>;
    return await handler(params);
  }

  /**
   * Handle subscription
   */
  private handleSubscription(
    path: string,
    procedure: AnyProcedure,
    port: chrome.runtime.Port,
  ): { subscriptionId: string } {
    // Check subscription limit per port
    const portSubs = this.subscriptions.get(port);
    if (portSubs && portSubs.size >= this.MAX_SUBSCRIPTIONS_PER_PORT) {
      throw new Error(`Subscription limit exceeded (max: ${this.MAX_SUBSCRIPTIONS_PER_PORT})`);
    }

    const subscriptionId = `${path}:${Date.now()}:${Math.random()}`;

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

    // Wrap handler in try-catch to prevent orphaned listeners
    let cleanup: SubscriptionCleanup;
    try {
      cleanup = handler(emit);
    }
    catch (error) {
      this.logger.error(`Subscription setup failed: ${path}`, error);
      throw error;
    }

    // Store cleanup function per port
    if (!this.subscriptions.has(port)) {
      this.subscriptions.set(port, new Map());
    }

    this.subscriptions.get(port)!.set(subscriptionId, cleanup);

    return { subscriptionId };
  }

  /**
   * Unsubscribe from a subscription
   */
  private unsubscribe(subscriptionId: string) {
    this.logger.info(`Unsubscribing: ${subscriptionId}`);

    for (const [port, subs] of this.subscriptions.entries()) {
      const cleanup = subs.get(subscriptionId);

      if (cleanup) {
        cleanup();
        subs.delete(subscriptionId);

        if (subs.size === 0) {
          this.subscriptions.delete(port);
        }

        break;
      }
    }
  }

  /**
   * Cleanup subscriptions for a disconnected client
   */
  private cleanupSubscriptions(port: chrome.runtime.Port) {
    const subs = this.subscriptions.get(port);

    if (!subs) {
      return;
    }

    this.logger.info(`Cleaning up ${subs.size} subscriptions for disconnected port`);

    for (const [_, cleanup] of subs.entries()) {
      cleanup();
    }

    this.subscriptions.delete(port);
  }

  /**
   * Resolve procedure by path (with caching)
   */
  private resolveProcedure(path: string): AnyProcedure | null {
    // Check cache first
    if (this.procedureCache.has(path)) {
      return this.procedureCache.get(path)!;
    }

    const parts = path.split('.');
    let current: any = this.router;

    for (const part of parts) {
      current = current[part];

      if (!current) {
        this.procedureCache.set(path, null);
        return null;
      }
    }

    const procedure = current as AnyProcedure;
    this.procedureCache.set(path, procedure);
    return procedure;
  }
}

/**
 * Create a bridge instance
 */
export function createBridge<TRouter extends Router>(
  router: TRouter,
  options?: BridgeOptions,
): Bridge<TRouter> {
  return new Bridge(router, options);
}

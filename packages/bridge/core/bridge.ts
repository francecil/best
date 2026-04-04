/**
 * Bridge Server (runs in Service Worker)
 */

import type {
  AnyProcedure,
  BridgeContext,
  BridgeOptions,
  ChromeApiConfig,
  DevToolsEvent,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSuccessResponse,
  Middleware,
  Next,
  Router,
  SubscriptionCleanup,
  SubscriptionEmit,
} from './types';
import { BridgeError } from './error';
import { callChromeApi, isChromeApiAllowed } from './chrome-api-resolver';
import { createLogger } from './logger';
import { JsonRpcErrorCode } from './types';

export class Bridge<TRouter extends Router> {
  private readonly router: TRouter;
  private readonly subscriptions = new Map<chrome.runtime.Port, Map<string, SubscriptionCleanup>>();
  private readonly logger: ReturnType<typeof createLogger>;
  private readonly ports = new Set<chrome.runtime.Port>();
  private readonly procedureCache = new Map<string, AnyProcedure | null>();
  private readonly MAX_SUBSCRIPTIONS_PER_PORT = 50;
  private readonly chromeApiConfig: ChromeApiConfig | undefined;
  private readonly middlewares: Middleware[] = [];
  private readonly devtoolsPorts = new Set<chrome.runtime.Port>();

  private readonly debug: boolean;

  constructor(router: TRouter, options: BridgeOptions = {}) {
    this.router = router;
    this.chromeApiConfig = options.chromeApi;
    this.debug = options.debug ?? false;
    this.logger = createLogger('Bridge', this.debug);
  }

  /**
   * Register a middleware to intercept all requests/responses.
   * Middlewares run in the order they are added.
   *
   * @example
   * bridge.use(validateOrigin(['https://example.com']))
   * bridge.use(rateLimit({ window: 60_000, max: 100 }))
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Start listening for connections
   */
  listen() {
    this.logger.info('Bridge listening...');

    // Content script uses chrome.runtime.connect({ name: 'bridge' }) — register onConnect up front.
    // (The connector does not send runtime messages with type bridge:connect.)
    chrome.runtime.onConnect.addListener((port) => {
      // DevTools panel connects with a dedicated port name (debug mode only)
      if (port.name === 'bridge:devtools') {
        if (this.debug) {
          this.devtoolsPorts.add(port);
          port.onDisconnect.addListener(() => {
            this.devtoolsPorts.delete(port);
          });
        }
        return;
      }

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
   * Emit an event to all connected DevTools panels (debug mode only).
   */
  private emitDevTools(event: DevToolsEvent) {
    if (!this.debug) return;
    for (const port of this.devtoolsPorts) {
      port.postMessage(event);
    }
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

    const req = message;
    const startTime = Date.now();

    const ctx: BridgeContext = {
      req,
      res: undefined,
      port,
      startTime,
    };

    this.emitDevTools({ type: 'request', id: req.id, path: req.method, data: req.params, timestamp: startTime });
    this.logger.debug(`→ ${req.method}`, req.params);

    // The innermost step: execute the procedure and store the result in ctx.res
    const coreHandler: Next = async () => {
      const result = await this.callProcedure(ctx.req.method, ctx.req.params, port);
      ctx.res = { jsonrpc: '2.0', id: ctx.req.id, result };
    };

    // Build Koa-style onion: dispatch(0) wraps mw[0] around dispatch(1), etc.
    const dispatch = (i: number): Next => {
      if (i === this.middlewares.length) return coreHandler;
      const mw = this.middlewares[i]!;
      return () => mw(ctx, dispatch(i + 1));
    };

    try {
      await dispatch(0)();

      if (ctx.res !== undefined) {
        const res = ctx.res as  JsonRpcSuccessResponse;
        this.logger.debug(`← ${ctx.req.method}`, res.result);
        port.postMessage(ctx.res);
        this.emitDevTools({ type: 'response', id: ctx.req.id, path: ctx.req.method, data: res.result, duration: Date.now() - startTime, timestamp: Date.now() });
      }
    }
    catch (error) {
      this.logger.error(`✗ ${ctx.req.method}`, error);

      const code = error instanceof BridgeError
        ? error.code
        : JsonRpcErrorCode.InternalError;

      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: ctx.req.id,
        error: {
          code,
          message: error instanceof Error ? error.message : String(error),
          data: error instanceof BridgeError ? error.data : error,
        },
      };

      port.postMessage(response);
      this.emitDevTools({ type: 'error', id: ctx.req.id, path: ctx.req.method, data: error instanceof Error ? error.message : String(error), duration: Date.now() - startTime, timestamp: Date.now() });
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

    if (procedure) {
      // Handle subscription
      if (procedure._meta.type === 'subscription') {
        return this.handleSubscription(path, procedure, port);
      }

      // Handle query/mutation
      const handler = procedure.handler as (input: unknown) => Promise<unknown>;
      return await handler(params);
    }

    // Fallback: generic Chrome API passthrough
    if (isChromeApiAllowed(path, this.chromeApiConfig)) {
      this.logger.debug(`Chrome API fallback: chrome.${path}`);
      return await callChromeApi(path, params);
    }

    throw new BridgeError(JsonRpcErrorCode.MethodNotFound, `Procedure not found: ${path}`);
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

/**
 * Bridge Server (runs in Service Worker)
 */

import type {
  BridgeContext,
  BridgeOptions,
  ChromeApiConfig,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  Middleware,
  Next,
  Router,
  ServerMiddleware,
} from './types';
import { BridgeError } from './error';
import { callChromeApi, isChromeApiAllowed } from '../utils/chrome-api-resolver';
import { Logger, createLogger } from '../utils/logger';
import { createLoggerMiddleware } from '../middlewares/logger';
import { createDevToolsMiddleware } from '../middlewares/devtools';
import { createProcedureResolver } from '../utils/resolve-procedure';
import { SubscriptionManager } from './subscription-manager';
import { JsonRpcErrorCode } from './types';

export class Bridge<TRouter extends Router> {
  private readonly logger: ReturnType<Logger>;
  private readonly middlewares: Array<Middleware | ServerMiddleware> = [];
  private readonly chromeApiConfig: ChromeApiConfig | undefined;
  private readonly resolve: ReturnType<typeof createProcedureResolver>;
  private readonly subscriptions: SubscriptionManager;

  constructor(router: TRouter, options: BridgeOptions = {}) {
    this.chromeApiConfig = options.chromeApi;
    this.logger = createLogger('Bridge', options.debug ?? false);
    this.resolve = createProcedureResolver(router);
    this.subscriptions = new SubscriptionManager(this.logger);

    if (options.debug) this.middlewares.push(createDevToolsMiddleware());
    if (options.logger) {
      const opts = typeof options.logger === 'object' ? options.logger : {};
      this.middlewares.push(createLoggerMiddleware(opts));
    }
  }

  /**
   * Register a middleware to intercept all requests/responses.
   * Middlewares run in the order they are added.
   *
   * @example
   * bridge.use(validateOrigin(['https://example.com']))
   * bridge.use(rateLimit({ window: 60_000, max: 100 }))
   */
  use(middleware: Middleware | ServerMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Start listening for connections
   */
  listen() {
    this.logger.info('Bridge listening...');

    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== 'bridge') return;

      const sender = port.sender;
      this.logger.info(`Port connected: ${port.name} (tab ${sender?.tab?.id}, frame ${sender?.frameId})`);

      port.onMessage.addListener((message) => this.handleMessage(message, port));
      port.onDisconnect.addListener(() => {
        this.logger.info('Port disconnected');
        this.subscriptions.cleanup(port);
      });

      port.postMessage({ type: 'bridge:ready' });
    });

    this.logger.success('Bridge ready');
  }

  private async handleMessage(message: JsonRpcRequest | JsonRpcNotification, port: chrome.runtime.Port) {
    if (message.method?.startsWith('$unsubscribe:')) {
      this.subscriptions.unsubscribe(message.method.replace('$unsubscribe:', ''));
      return;
    }

    if (!('id' in message)) {
      this.logger.warn('Received notification (no id), ignoring');
      return;
    }

    const ctx: BridgeContext = { req: message, res: undefined, port, startTime: Date.now() };

    const coreHandler: Next = async () => {
      const result = await this.callProcedure(ctx.req.method, ctx.req.params, port);
      ctx.res = { jsonrpc: '2.0', id: ctx.req.id, result };
    };

    const dispatch = (i: number): Next => {
      if (i === this.middlewares.length) return coreHandler;
      return () => this.middlewares[i]!(ctx, dispatch(i + 1));
    };

    try {
      await dispatch(0)();
      if (ctx.res !== undefined) port.postMessage(ctx.res);
    }
    catch (error) {
      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: ctx.req.id,
        error: {
          code: error instanceof BridgeError ? error.code : JsonRpcErrorCode.InternalError,
          message: error instanceof Error ? error.message : String(error),
          data: error instanceof BridgeError ? error.data : error,
        },
      };
      port.postMessage(response);
    }
  }

  private async callProcedure(path: string, params: unknown, port: chrome.runtime.Port): Promise<unknown> {
    const procedure = this.resolve(path);

    if (procedure) {
      if (procedure._meta.type === 'subscription') {
        return this.subscriptions.handle(path, procedure, port);
      }
      return (procedure.handler as (input: unknown) => Promise<unknown>)(params);
    }

    if (isChromeApiAllowed(path, this.chromeApiConfig)) {
      this.logger.debug(`Chrome API fallback: chrome.${path}`);
      return callChromeApi(path, params);
    }

    throw new BridgeError(JsonRpcErrorCode.MethodNotFound, `Procedure not found: ${path}`);
  }
}

export function createBridge<TRouter extends Router>(router: TRouter, options?: BridgeOptions): Bridge<TRouter> {
  return new Bridge(router, options);
}

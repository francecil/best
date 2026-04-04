/**
 * Bridge Client (runs in Web Page)
 */

import type {
  BaseContext,
  ChromeApiClient,
  ClientOptions,
  InferClient,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  Middleware,
  Next,
  Router,
} from './types';
import { BridgeError } from './error';
import { createLogger } from './logger';
import { retry } from '../middlewares/retry';
import { createLoggerMiddleware } from '../middlewares/logger';

export class BridgeClient<TRouter extends Router> {
  /** 双向连接通道 port */
  private port: MessagePort | null = null;
  private ready = false;
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private requestId = 0;
  private readonly pendingRequests = new Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: number;
    }
  >();

  private readonly subscriptions = new Map<
    string,
    {
      callback: (data: unknown) => void;
      subscriptionId?: string;
      pendingEvents?: unknown[];
    }
  >();

  private readonly logger: ReturnType<typeof createLogger>;
  private readonly options: ClientOptions;
  private readonly middlewares: Middleware[];

  constructor(options: ClientOptions = {}) {
    this.options = {
      debug: false,
      timeout: 30000,
      retry: {
        attempts: 0,
        delay: 1000,
      },
      ...options,
    };

    this.logger = createLogger('Client', this.options.debug ?? false);
    this.middlewares = this.buildMiddlewares();

    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    this.init();
  }

  /**
   * Build the internal middleware stack from ClientOptions.
   * Logger is outermost (sees the full duration including retries).
   * Retry is inner (wraps only the sendRequest call).
   */
  private buildMiddlewares(): Middleware[] {
    const mws: Middleware[] = [];

    if (this.options.logger) {
      const opts = typeof this.options.logger === 'object' ? this.options.logger : {};
      mws.push(createLoggerMiddleware(opts));
    }

    const r = this.options.retry;
    if (r && r.attempts > 0) {
      mws.push(retry(r));
    }

    return mws;
  }

  /**
   * Initialize connection
   */
  private init() {
    this.logger.info('Initializing client...');

    // Wait for bridge:ready event
    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'bridge:init' && event.data?.port) {
        this.logger.info('Received MessagePort from Content Script');

        // 连接成功后，建立双向连接通道 port
        this.port = event.data.port;

        this.port!.onmessage = e => this.handleMessage(e.data);

        // Handle port closure - reject pending requests immediately
        this.port!.addEventListener('close', () => {
          this.logger.warn('Port closed, rejecting pending requests');
          const error = new Error('Connection closed');
          for (const [_, pending] of this.pendingRequests.entries()) {
            clearTimeout(pending.timer);
            pending.reject(error);
          }
          this.pendingRequests.clear();
        });

        window.removeEventListener('message', messageHandler);

        this.ready = true;
        this.resolveReady();

        this.logger.success('Client ready');
      }
    };

    window.addEventListener('message', messageHandler);

    // Request connection
    window.postMessage({ type: 'bridge:connect' }, globalThis.location.origin);
  }

  /**
   * Wait for client to be ready
   */
  async $waitForReady() {
    return this.readyPromise;
  }

  /**
   * Call an arbitrary method by string path.
   * Useful for generic Chrome API passthrough when chromeApi is enabled on the bridge.
   */
  async $call<T = unknown>(method: string, params?: unknown): Promise<T> {
    return this.request<T>(method, params);
  }

  /**
   * Proxy for calling generic Chrome APIs by chained property access.
   * Usage: client.$chrome.bookmarks.getTree()
   * Requires chromeApi to be enabled on the bridge.
   */
  get $chrome(): ChromeApiClient {
    return this.createChromeProxy('') as ChromeApiClient;
  }

  private createChromeProxy(basePath: string): any {
    const self = this;
    return new Proxy(function () {}, {
      get(_target, prop: string) {
        const nextPath = basePath ? `${basePath}.${prop}` : prop;
        return self.createChromeProxy(nextPath);
      },
      apply(_target, _thisArg, args: unknown[]) {
        const params = args.length === 0 ? undefined : args.length === 1 ? args[0] : args;
        return self.request(basePath, params);
      },
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(
    message: JsonRpcResponse | JsonRpcNotification,
  ) {
    // Handle subscription notification
    if ('method' in message && message.method?.startsWith('$subscription:')) {
      const subscriptionId = message.method.replace('$subscription:', '');
      this.handleSubscriptionData(subscriptionId, message.params);
      return;
    }

    // Handle response
    if (!('method' in message)) {
      this.handleResponse(message as JsonRpcResponse);
    }
  }

  /**
   * Handle RPC response
   */
  private handleResponse(response: JsonRpcResponse) {
    const pending = this.pendingRequests.get(response.id);

    if (!pending) {
      this.logger.warn('Received response for unknown request:', response.id);
      return;
    }

    clearTimeout(pending.timer);
    this.pendingRequests.delete(response.id);

    if ('error' in response) {
      pending.reject(BridgeError.fromResponse(response.error));
    }
    else {
      pending.resolve(response.result);
    }
  }

  /**
   * Handle subscription data
   */
  private handleSubscriptionData(subscriptionId: string, data: unknown) {
    for (const sub of this.subscriptions.values()) {
      if (sub.subscriptionId === subscriptionId) {
        sub.callback(data);
        break;
      }
      // If subscription ID not set yet, queue the event
      if (!sub.subscriptionId && sub.pendingEvents) {
        sub.pendingEvents.push(data);
      }
    }
  }

  /**
   * Send RPC request (single attempt)
   */
  private sendRequest<TResult = unknown>(method: string, params?: unknown): Promise<TResult> {
    const id = ++this.requestId;
    const timeout = this.options.timeout!;

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.logger.debug(`→ ${method}`, params);
      this.port!.postMessage(request);
    });
  }

  /**
   * Send RPC request through the middleware pipeline.
   */
  private async request<TResult = unknown>(
    method: string,
    params?: unknown,
  ): Promise<TResult> {
    if (!this.ready || !this.port) {
      await this.readyPromise;
    }

    const ctx: BaseContext = {
      req: { jsonrpc: '2.0', id: 0, method, params },
      res: undefined,
      startTime: Date.now(),
    };

    // Core handler: send over the MessagePort and populate ctx.res on success.
    // Each call creates a fresh requestId, so retries get independent IDs.
    const coreHandler: Next = async () => {
      const result = await this.sendRequest<TResult>(method, params);
      ctx.res = { jsonrpc: '2.0', id: ctx.req.id, result };
    };

    const dispatch = (i: number): Next => {
      if (i === this.middlewares.length) return coreHandler;
      const mw = this.middlewares[i]!;
      return () => mw(ctx, dispatch(i + 1));
    };

    await dispatch(0)();

    if (ctx.res && 'result' in ctx.res) return ctx.res.result as TResult;
    if (ctx.res && 'error' in ctx.res) throw BridgeError.fromResponse(ctx.res.error);
    throw new Error(`No response for request: ${method}`);
  }

  /**
   * Create procedure proxy
   */
  private createProcedure(path: string): any {
    return {
      query: async (input?: unknown) => {
        const result = await this.request(path, input);
        this.logger.debug(`← ${path}`, result);
        return result;
      },

      mutate: async (input?: unknown) => {
        const result = await this.request(path, input);
        this.logger.debug(`← ${path}`, result);
        return result;
      },

      subscribe: (callback: (data: unknown) => void) => {
        const subKey = path;
        const pendingEvents: unknown[] = [];

        // Store callback with pending event queue
        this.subscriptions.set(subKey, { callback, pendingEvents });

        // Request subscription
        this.request<{ subscriptionId: string }>(path).then((result) => {
          const sub = this.subscriptions.get(subKey);
          if (sub) {
            sub.subscriptionId = result.subscriptionId;
            this.logger.info(`Subscribed: ${path} (${result.subscriptionId})`);

            // Flush pending events that arrived during handshake
            if (sub.pendingEvents && sub.pendingEvents.length > 0) {
              this.logger.debug(`Flushing ${sub.pendingEvents.length} pending events`);
              for (const event of sub.pendingEvents) {
                callback(event);
              }
            }

            // Clear pending queue
            delete sub.pendingEvents;
          }
        }).catch((error) => {
          this.logger.error(`Subscription failed: ${path}`, error);
          this.subscriptions.delete(subKey);
        });

        // Return unsubscribe function
        return () => {
          const sub = this.subscriptions.get(subKey);

          if (sub?.subscriptionId) {
            this.logger.info(`Unsubscribing: ${sub.subscriptionId}`);

            this.port!.postMessage({
              jsonrpc: '2.0',
              method: `$unsubscribe:${sub.subscriptionId}`,
            });
          }

          this.subscriptions.delete(subKey);
        };
      },
    };
  }

  /**
   * Create router proxy — each node is both accessible (for path building)
   * and directly callable as a procedure.
   *
   * Usage:
   *   bridge.ns.method(input)           — query/mutation
   *   bridge.ns.onEvent(callback)        — subscription (returns unsubscribe fn)
   */
  private createRouterProxy(basePath: string = ''): any {
    const self = this;
    return new Proxy(function () {}, {
      get(_target, prop: string) {
        const nextPath = basePath ? `${basePath}.${prop}` : prop;
        return self.createRouterProxy(nextPath);
      },
      apply(_target, _thisArg, args: unknown[]) {
        const [firstArg] = args;
        if (typeof firstArg === 'function') {
          // Subscription: bridge.ns.onEvent(callback) => () => void
          return self.createProcedure(basePath).subscribe(firstArg as (data: unknown) => void);
        }
        // Query/mutation: bridge.ns.method(input?) => Promise<result>
        return self.request(basePath, args.length === 0 ? undefined : firstArg);
      },
    });
  }

  /**
   * Get typed client
   */
  get client(): InferClient<TRouter> {
    return this.createRouterProxy() as InferClient<TRouter>;
  }
}

/**
 * Create a client instance
 */
export function createClient<TRouter extends Router>(
  options?: ClientOptions,
): InferClient<TRouter> & {
  $waitForReady: () => Promise<void>;
  $call: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  $chrome: ChromeApiClient;
} {
  const instance = new BridgeClient<TRouter>(options);

  return new Proxy(instance.client as any, {
    get(target, prop) {
      if (prop === '$waitForReady') {
        return () => instance.$waitForReady();
      }
      if (prop === '$call') {
        return <T = unknown>(method: string, params?: unknown) => instance.$call<T>(method, params);
      }
      if (prop === '$chrome') {
        return instance.$chrome;
      }
      return target[prop];
    },
  });
}

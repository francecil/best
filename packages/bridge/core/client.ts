/**
 * Bridge Client (runs in Web Page)
 */

import type {
  ClientOptions,
  InferClient,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  Router,
} from './types';
import { createLogger } from './logger';

export class BridgeClient<TRouter extends Router> {
  private port: MessagePort | null = null;
  private ready = false;
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private requestId = 0;
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: number;
    }
  >();

  private subscriptions = new Map<
    string,
    {
      callback: (data: unknown) => void;
      subscriptionId?: string;
      pendingEvents?: unknown[];
    }
  >();

  private logger: ReturnType<typeof createLogger>;
  private options: ClientOptions;

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

    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    this.init();
  }

  /**
   * Initialize connection
   */
  private async init() {
    this.logger.info('Initializing client...');

    // Wait for bridge:ready event
    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'bridge:init' && event.data?.port) {
        this.logger.info('Received MessagePort from Content Script');

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
    window.postMessage({ type: 'bridge:connect' }, '*');
  }

  /**
   * Wait for client to be ready
   */
  async $waitForReady(): Promise<void> {
    return this.readyPromise;
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
      const error = new Error(response.error.message)
      ;(error as any).code = response.error.code
      ;(error as any).data = response.error.data;
      pending.reject(error);
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
   * Send RPC request
   */
  private async request<TResult = unknown>(
    method: string,
    params?: unknown,
  ): Promise<TResult> {
    if (!this.ready || !this.port) {
      await this.readyPromise;
    }

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
   * Create router proxy (single level per segment: a.b.c.query → path "a.b.c")
   */
  private createRouterProxy(basePath: string = ''): any {
    return new Proxy(
      {},
      {
        get: (_target, prop: string) => {
          if (['query', 'mutate', 'subscribe'].includes(prop)) {
            return this.createProcedure(basePath)[prop];
          }

          const nextPath = basePath ? `${basePath}.${prop}` : prop;
          return this.createRouterProxy(nextPath);
        },
      },
    );
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
): BridgeClient<TRouter>['client'] & { $waitForReady: () => Promise<void> } {
  const instance = new BridgeClient<TRouter>(options);

  return new Proxy(instance.client as any, {
    get(target, prop) {
      if (prop === '$waitForReady') {
        return () => instance.$waitForReady();
      }

      return target[prop];
    },
  });
}

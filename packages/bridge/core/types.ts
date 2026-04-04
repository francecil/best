/**
 * Core type definitions for Extension Bridge
 */

// ========================================
// Procedure Types
// ========================================

export type ProcedureType = 'query' | 'mutation' | 'subscription';

export interface ProcedureMeta {
  type: ProcedureType;
}

export type ProcedureHandler<TInput, TOutput> =
  | ((input: TInput) => Promise<TOutput>)
  | ((input: TInput) => TOutput);

export type SubscriptionEmit<TOutput> = (data: TOutput) => void;
export type SubscriptionCleanup = () => void;
export type SubscriptionHandler<TOutput> = (emit: SubscriptionEmit<TOutput>) => SubscriptionCleanup;

export interface Procedure<TInput = unknown, TOutput = unknown, TType extends ProcedureType = ProcedureType> {
  _meta: { type: TType };
  _input?: TInput;
  _output?: TOutput;
  handler: TType extends 'subscription'
    ? SubscriptionHandler<TOutput>
    : ProcedureHandler<TInput, TOutput>;
}

// ========================================
// Router Types
// ========================================

export type AnyProcedure = Procedure<any, any, ProcedureType>;

export interface ProcedureRecord {
  [key: string]: AnyProcedure | ProcedureRecord;
}

export type Router = ProcedureRecord;

// ========================================
// Client Types
// ========================================

/** Callable type for query/mutation procedures */
export type ProcedureCallable<TInput, TOutput> =
  [TInput] extends [void]
    ? () => Promise<TOutput>
    : (input: TInput) => Promise<TOutput>;

/** Callable type for subscription procedures */
export type SubscriptionCallable<TOutput> =
  (callback: (data: TOutput) => void) => () => void;

// 推导客户端类型
export type InferClientType<TProcedure> =
  TProcedure extends Procedure<infer TInput, infer TOutput, infer TType>
    ? TType extends 'query'
      ? ProcedureCallable<TInput, TOutput>
      : TType extends 'mutation'
        ? ProcedureCallable<TInput, TOutput>
        : TType extends 'subscription'
          ? SubscriptionCallable<TOutput>
          : never
    : TProcedure extends ProcedureRecord
      ? InferClient<TProcedure>
      : never;

export type InferClient<TRouter extends Router> = {
  [K in keyof TRouter]: InferClientType<TRouter[K]>
};

// ========================================
// JSON-RPC Protocol
// ========================================

export interface JsonRpcRequest<TParams = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: TParams;
}

export interface JsonRpcSuccessResponse<TResult = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  result: TResult;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string | number;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse<TResult = unknown> =
  | JsonRpcSuccessResponse<TResult>
  | JsonRpcErrorResponse;

export interface JsonRpcNotification<TParams = unknown> {
  jsonrpc: '2.0';
  method: string;
  params?: TParams;
}

// ========================================
// Error Codes (JSON-RPC 2.0)
// ========================================

export enum JsonRpcErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  // Custom errors
  Unauthorized = -32001,
  Forbidden = -32002,
  NotFound = -32003,
  Timeout = -32004,
}

// ========================================
// Bridge Options
// ========================================

/**
 * Configuration for generic Chrome API fallback.
 * - `true`: allow all chrome.* namespaces
 * - `string[]`: allowlist of top-level namespaces (e.g. ['bookmarks', 'history'])
 * - `false` | `undefined`: disabled (default)
 */
export type ChromeApiConfig = boolean | string[];

export interface BridgeOptions {
  debug?: boolean;
  timeout?: number;
  /** Enable generic Chrome API passthrough for unregistered procedures */
  chromeApi?: ChromeApiConfig;
  /** Enable the logger middleware on the bridge pipeline */
  logger?: boolean | { level?: 'debug' | 'info' };
}

// ========================================
// Chrome API Client Types
// ========================================

/** Client-side proxy type for $chrome generic passthrough */
export type ChromeApiClient = {
  [namespace: string]: ChromeApiClient & ((...args: unknown[]) => Promise<unknown>);
};

export interface ClientOptions extends BridgeOptions {
  retry?: {
    attempts: number;
    delay: number;
    backoff?: 'linear' | 'exponential';
  };
  /** Enable the logger middleware on the client pipeline */
  logger?: boolean | { level?: 'debug' | 'info' };
}

// ========================================
// Middleware Types
// ========================================

/**
 * Base context shared by both server (Bridge) and client (BridgeClient) middleware.
 * Contains only the fields that every middleware environment provides.
 */
export interface BaseContext {
  /** The JSON-RPC request. Mutate before calling next() to change the input. */
  req: JsonRpcRequest;
  /**
   * The JSON-RPC response. Populated after next() completes successfully.
   * Mutate after calling next() to transform the output.
   */
  res: JsonRpcResponse | undefined;
  /** Unix timestamp (ms) when the request was received */
  startTime: number;
}

/**
 * Server-specific context — extends BaseContext with the chrome.runtime.Port.
 * Only available in the Bridge (service worker) middleware pipeline.
 */
export interface BridgeContext extends BaseContext {
  /** The chrome.runtime.Port for this connection */
  port: chrome.runtime.Port;
}

/** Call next() to pass control to the next middleware (or the procedure). */
export type Next = () => Promise<void>;

/**
 * Generic Koa-style middleware. Works on **both** the Bridge (server) and
 * BridgeClient (client) pipelines.
 *
 * Receives `BaseContext` — the fields common to both environments.
 * Use this type for reusable middleware (e.g. logging, retry) that doesn't
 * need access to the underlying chrome.runtime.Port.
 *
 * - **Before `next()`**: read/modify `ctx.req` to change the request.
 * - **After `next()`**: read/modify `ctx.res` to transform the response.
 * - **On error**: wrap `await next()` in try/catch to intercept failures.
 *
 * @example
 * bridge.use(async (ctx, next) => {
 *   console.log(`→ ${ctx.req.method}`, ctx.req.params)
 *   await next()
 *   console.log(`← ${ctx.req.method} (${Date.now() - ctx.startTime}ms)`)
 * })
 */
export type Middleware = (ctx: BaseContext, next: Next) => Promise<void>;

/**
 * Server-only Koa-style middleware. Can only be passed to `bridge.use()`.
 *
 * Receives `BridgeContext`, which extends `BaseContext` with `ctx.port`
 * (the `chrome.runtime.Port` of the connected page). Use this type when
 * your middleware needs to inspect the sender — e.g. for origin validation
 * or per-connection rate limiting.
 *
 * @example
 * bridge.use(async (ctx, next) => {
 *   const origin = ctx.port.sender?.origin
 *   if (origin !== 'https://example.com') throw new BridgeError(JsonRpcErrorCode.Forbidden, 'blocked')
 *   await next()
 * })
 */
export type ServerMiddleware = (ctx: BridgeContext, next: Next) => Promise<void>;

// ========================================
// DevTools Types
// ========================================

export interface DevToolsEvent {
  type: 'request' | 'response' | 'error' | 'subscribe' | 'unsubscribe';
  id: number | string;
  path: string;
  data: unknown;
  /** Duration in ms — present on response and error events */
  duration?: number;
  timestamp: number;
}

// ========================================
// Message Types
// ========================================

export interface ConnectMessage {
  type: 'bridge:connect';
  port: MessagePort;
}

export interface ReadyMessage {
  type: 'bridge:ready';
}

// ========================================
// Helper Types
// ========================================

export type Awaitable<T> = T | Promise<T>;

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
};

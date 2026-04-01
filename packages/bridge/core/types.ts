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
  };
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

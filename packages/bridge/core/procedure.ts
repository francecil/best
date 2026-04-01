/**
 * Procedure builders
 */

import type {
  Procedure,
  ProcedureHandler,
  SubscriptionHandler,
} from './types';

/**
 * Create a query procedure (read-only operations)
 */
export function query<TInput = void, TOutput = unknown>(
  handler: ProcedureHandler<TInput, TOutput>,
): Procedure<TInput, TOutput, 'query'> {
  return {
    _meta: { type: 'query' },
    handler,
  };
}

/**
 * Create a mutation procedure (write operations)
 */
export function mutation<TInput = void, TOutput = unknown>(
  handler: ProcedureHandler<TInput, TOutput>,
): Procedure<TInput, TOutput, 'mutation'> {
  return {
    _meta: { type: 'mutation' },
    handler,
  };
}

/**
 * Create a subscription procedure (real-time events)
 */
export function subscription<TOutput = unknown>(
  handler: SubscriptionHandler<TOutput>,
): Procedure<void, TOutput, 'subscription'> {
  return {
    _meta: { type: 'subscription' },
    handler,
  };
}

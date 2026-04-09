import { BridgeError } from '../core/error';
import { JsonRpcErrorCode } from '../core/types';
import type { ServerMiddleware } from '../core/types';

/**
 * Validates that the incoming connection originates from one of the allowed origins.
 * Throws `JsonRpcErrorCode.Forbidden` before calling `next()` if the origin is denied.
 *
 * @example
 * bridge.use(validateOrigin(['https://example.com']))
 */
export function validateOrigin(allowedOrigins: string[]): ServerMiddleware {
  return async (ctx, next) => {
    const port = ctx.port;
    const senderOrigin = port.sender?.origin ?? port.sender?.url;

    if (!senderOrigin) {
      throw new BridgeError(
        JsonRpcErrorCode.Forbidden,
        'Request origin could not be determined',
      );
    }

    const allowed = allowedOrigins.some(origin => senderOrigin.startsWith(origin));
    if (!allowed) {
      throw new BridgeError(
        JsonRpcErrorCode.Forbidden,
        `Origin not allowed: ${senderOrigin}`,
      );
    }

    await next();
  };
}

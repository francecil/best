/**
 * BridgeError - typed error with JSON-RPC error code
 */

export class BridgeError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.data = data;
  }

  toJSON() {
    return { code: this.code, message: this.message, data: this.data };
  }

  static fromResponse(error: { code: number; message: string; data?: unknown }): BridgeError {
    return new BridgeError(error.code, error.message, error.data);
  }
}

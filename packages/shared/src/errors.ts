/**
 * Base error class for all Dustless errors
 */
export class DustlessError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'DustlessError';
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      retryable: this.retryable,
    };
  }
}

/**
 * Thrown when user has insufficient balance for an operation
 */
export class InsufficientBalanceError extends DustlessError {
  constructor(chainId: number, required: string, actual: string) {
    super(
      `Insufficient balance on chain ${chainId}. Required: ${required}, Available: ${actual}`,
      'INSUFFICIENT_BALANCE',
      400,
      { chainId, required, actual },
      false
    );
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * Thrown when no bridge routes or swap routes are available
 */
export class NoRoutesFoundError extends DustlessError {
  constructor(fromChainId: number, toChainId: number, operation: 'bridge' | 'swap' = 'bridge', reasons?: string[]) {
    const message = operation === 'swap'
      ? 'No swap routes available for this token pair'
      : 'No bridge routes available for this chain pair';

    const defaultReasons = operation === 'swap'
      ? [
          'Unsupported token pair',
          'Amount too small',
          'Insufficient liquidity',
          'DEX temporarily unavailable',
        ]
      : [
          'Unsupported chain pair',
          'Amount too small',
          'Insufficient liquidity',
          'Bridge temporarily unavailable',
        ];

    super(
      message,
      'NO_ROUTES_FOUND',
      404,
      {
        fromChainId,
        toChainId,
        operation,
        possibleReasons: reasons ?? defaultReasons,
      },
      true // Retryable - might work later
    );
    this.name = 'NoRoutesFoundError';
  }
}

/**
 * Thrown when a bridge provider API fails
 */
export class ProviderError extends DustlessError {
  constructor(
    provider: string,
    message: string,
    statusCode?: number,
    details?: unknown
  ) {
    super(
      `Bridge provider '${provider}' failed: ${message}`,
      'PROVIDER_ERROR',
      statusCode ?? 502,
      details ? { provider, details } : { provider },
      true // Retryable - provider might recover
    );
    this.name = 'ProviderError';
  }
}

/**
 * Thrown when transaction simulation fails
 */
export class SimulationFailedError extends DustlessError {
  constructor(message: string, simulationDetails?: unknown) {
    super(
      `Transaction simulation failed: ${message}`,
      'SIMULATION_FAILED',
      400,
      simulationDetails,
      false
    );
    this.name = 'SimulationFailedError';
  }
}

/**
 * Thrown when RPC request fails
 */
export class RPCError extends DustlessError {
  constructor(chainId: number, message: string, rpcUrl?: string) {
    super(
      `RPC request failed for chain ${chainId}: ${message}`,
      'RPC_ERROR',
      503,
      { chainId, rpcUrl },
      true // Retryable - RPC might recover
    );
    this.name = 'RPCError';
  }
}

/**
 * Thrown when a request times out
 */
export class TimeoutError extends DustlessError {
  constructor(operation: string, timeoutMs: number) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      'TIMEOUT_ERROR',
      504,
      { operation, timeoutMs },
      true // Retryable
    );
    this.name = 'TimeoutError';
  }
}

/**
 * Thrown when an invalid chain ID is provided
 */
export class InvalidChainError extends DustlessError {
  constructor(chainId: number, validChainIds?: number[]) {
    super(
      `Invalid or unsupported chain ID: ${chainId}`,
      'INVALID_CHAIN',
      400,
      { chainId, validChainIds },
      false
    );
    this.name = 'InvalidChainError';
  }
}

/**
 * Thrown when rate limit is exceeded
 */
export class RateLimitError extends DustlessError {
  constructor(retryAfter: number) {
    super(
      `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
      'RATE_LIMIT_EXCEEDED',
      429,
      { retryAfter },
      true
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Helper to check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof DustlessError) {
    return error.retryable;
  }

  // Network errors are generally retryable
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('503') ||
      message.includes('504')
    );
  }

  return false;
}

/**
 * Helper to get user-friendly error messages
 */
export function getUserFriendlyError(error: unknown): string {
  if (error instanceof DustlessError) {
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message;

    // Map common error patterns to user-friendly messages
    if (message.includes('insufficient funds')) {
      return 'Insufficient balance to complete this transaction.';
    }
    if (message.includes('user rejected')) {
      return 'Transaction was cancelled.';
    }
    if (message.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }
    if (message.includes('network')) {
      return 'Network error. Please check your connection.';
    }
    if (message.includes('gas')) {
      return 'Gas estimation failed. The transaction may fail.';
    }

    return message;
  }

  return 'An unexpected error occurred. Please try again.';
}

/**
 * Helper to extract error code from unknown error
 */
export function getErrorCode(error: unknown): string {
  if (error instanceof DustlessError) {
    return error.code;
  }

  if (error instanceof Error) {
    return 'UNKNOWN_ERROR';
  }

  return 'INTERNAL_ERROR';
}

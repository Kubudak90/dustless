import pino from 'pino';
import { env, isDevelopment, isTest } from './env.js';

/**
 * Centralized logger configuration using Pino
 * Provides structured logging with proper levels and formatting
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: 'dustless-api',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a child logger with a specific context/module name
 * Usage: const log = createLogger('priceOracle');
 */
export function createLogger(module: string) {
  return logger.child({ module });
}

/**
 * Pre-configured loggers for common modules
 */
export const loggers = {
  cache: createLogger('cache'),
  price: createLogger('priceOracle'),
  gas: createLogger('gasManager'),
  balance: createLogger('balances'),
  quote: createLogger('quote'),
  build: createLogger('build'),
  scan: createLogger('scan'),
  swap: createLogger('swap'),
  socket: createLogger('socket'),
  lifi: createLogger('lifi'),
  socketProvider: createLogger('socketProvider'),
  across: createLogger('across'),
  odos: createLogger('odos'),
  zora: createLogger('zora'),
  dedup: createLogger('deduplication'),
  rpc: createLogger('rpcHealth'),
  sentry: createLogger('sentry'),
} as const;

export type LoggerModule = keyof typeof loggers;

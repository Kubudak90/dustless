import { describe, it, expect } from 'vitest';
import { createLogger, loggers } from '../logger.js';

describe('Logger Configuration', () => {
  describe('createLogger', () => {
    it('should create a child logger with module name', () => {
      const testLogger = createLogger('testModule');

      expect(testLogger).toBeDefined();
      // Pino loggers have these methods
      expect(typeof testLogger.info).toBe('function');
      expect(typeof testLogger.error).toBe('function');
      expect(typeof testLogger.warn).toBe('function');
      expect(typeof testLogger.debug).toBe('function');
    });

    it('should create multiple independent loggers', () => {
      const logger1 = createLogger('module1');
      const logger2 = createLogger('module2');

      expect(logger1).not.toBe(logger2);
    });
  });

  describe('loggers', () => {
    it('should have all pre-configured module loggers', () => {
      expect(loggers.cache).toBeDefined();
      expect(loggers.price).toBeDefined();
      expect(loggers.gas).toBeDefined();
      expect(loggers.balance).toBeDefined();
      expect(loggers.quote).toBeDefined();
      expect(loggers.build).toBeDefined();
      expect(loggers.scan).toBeDefined();
      expect(loggers.swap).toBeDefined();
      expect(loggers.socket).toBeDefined();
      expect(loggers.lifi).toBeDefined();
      expect(loggers.socketProvider).toBeDefined();
      expect(loggers.across).toBeDefined();
      expect(loggers.odos).toBeDefined();
      expect(loggers.zora).toBeDefined();
      expect(loggers.dedup).toBeDefined();
      expect(loggers.rpc).toBeDefined();
      expect(loggers.sentry).toBeDefined();
    });

    it('should have working log methods on all loggers', () => {
      // Test that each logger has the expected methods
      Object.entries(loggers).forEach(([name, logger]) => {
        expect(typeof logger.info).toBe('function');
        expect(typeof logger.error).toBe('function');
        expect(typeof logger.warn).toBe('function');
        expect(typeof logger.debug).toBe('function');
        expect(typeof logger.trace).toBe('function');
      });
    });
  });
});

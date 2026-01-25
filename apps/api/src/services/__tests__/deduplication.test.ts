import { describe, it, expect, beforeEach } from 'vitest';
import {
  deduplicateRequest,
  createDeduplicationKey,
  clearDeduplicationCache,
} from '../deduplication.js';

describe('Deduplication Service', () => {
  beforeEach(() => {
    // Clear any pending requests before each test
    clearDeduplicationCache();
  });

  describe('createDeduplicationKey', () => {
    it('should create consistent keys for same operation and params', () => {
      const key1 = createDeduplicationKey('quote', {
        fromChainId: 8453,
        toChainId: 42161,
        amountWei: '1000000000000000000',
      });

      const key2 = createDeduplicationKey('quote', {
        fromChainId: 8453,
        toChainId: 42161,
        amountWei: '1000000000000000000',
      });

      expect(key1).toBe(key2);
    });

    it('should create different keys for different operations', () => {
      const key1 = createDeduplicationKey('quote', { id: 1 });
      const key2 = createDeduplicationKey('scan', { id: 1 });

      expect(key1).not.toBe(key2);
    });

    it('should create different keys for different params', () => {
      const key1 = createDeduplicationKey('quote', { amount: '100' });
      const key2 = createDeduplicationKey('quote', { amount: '200' });

      expect(key1).not.toBe(key2);
    });

    it('should handle complex nested params', () => {
      const key = createDeduplicationKey('complex', {
        nested: { a: 1, b: 2 },
        array: [1, 2, 3],
      });

      expect(key).toContain('complex:');
      expect(typeof key).toBe('string');
    });
  });

  describe('deduplicateRequest', () => {
    it('should execute function once for same key', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'result';
      };

      // Start two concurrent requests with same key
      const promise1 = deduplicateRequest('test-key', fn);
      const promise2 = deduplicateRequest('test-key', fn);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(callCount).toBe(1);
      expect(result1).toBe('result');
      expect(result2).toBe('result');
    });

    it('should execute function separately for different keys', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        return callCount;
      };

      const promise1 = deduplicateRequest('key-1', fn);
      const promise2 = deduplicateRequest('key-2', fn);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(callCount).toBe(2);
      expect(result1).toBe(1);
      expect(result2).toBe(2);
    });

    it('should handle errors and propagate to all waiters', async () => {
      const error = new Error('Test error');
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        throw error;
      };

      const promise1 = deduplicateRequest('error-key', fn);
      const promise2 = deduplicateRequest('error-key', fn);

      await expect(promise1).rejects.toThrow('Test error');
      await expect(promise2).rejects.toThrow('Test error');
    });

    it('should allow new requests after completion', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        return callCount;
      };

      // First request
      const result1 = await deduplicateRequest('reuse-key', fn);
      expect(result1).toBe(1);

      // Second request after first completes
      const result2 = await deduplicateRequest('reuse-key', fn);
      expect(result2).toBe(2);

      expect(callCount).toBe(2);
    });

    it('should handle concurrent requests correctly', async () => {
      const results: number[] = [];
      let counter = 0;

      const fn = async (delay: number) => {
        counter++;
        const value = counter;
        await new Promise(resolve => setTimeout(resolve, delay));
        return value;
      };

      // Start multiple concurrent requests
      const promises = [
        deduplicateRequest('concurrent-1', () => fn(100)),
        deduplicateRequest('concurrent-1', () => fn(100)), // Same key - deduplicated
        deduplicateRequest('concurrent-2', () => fn(50)),  // Different key
        deduplicateRequest('concurrent-1', () => fn(100)), // Same key - deduplicated
      ];

      const allResults = await Promise.all(promises);

      // First three promises with same key should have same result
      expect(allResults[0]).toBe(allResults[1]);
      expect(allResults[0]).toBe(allResults[3]);

      // Different key should have different result
      expect(allResults[2]).not.toBe(allResults[0]);
    });
  });
});

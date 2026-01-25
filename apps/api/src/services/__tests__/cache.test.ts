import { describe, it, expect } from 'vitest';
import { CacheKeys, CacheTTL } from '../cache.js';

/**
 * Cache Service Tests
 *
 * Note: CacheService integration tests are skipped because they require
 * a real Redis instance. The service is tested in integration/E2E tests.
 *
 * Here we test the cache key builders and TTL constants.
 */

describe('CacheKeys', () => {
  it('should generate correct price key', () => {
    expect(CacheKeys.price('ethereum')).toBe('price:ethereum');
    expect(CacheKeys.price('bitcoin')).toBe('price:bitcoin');
  });

  it('should generate correct batch prices key with sorted IDs', () => {
    const key1 = CacheKeys.batchPrices(['ethereum', 'bitcoin']);
    const key2 = CacheKeys.batchPrices(['bitcoin', 'ethereum']);

    // Should be the same regardless of input order
    expect(key1).toBe(key2);
    expect(key1).toBe('prices:bitcoin,ethereum');
  });

  it('should generate correct quote key', () => {
    const key = CacheKeys.quote({
      fromChainId: 8453,
      toChainId: 42161,
      tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      amountWei: '1000000000000000000',
    });

    expect(key).toBe('quote:8453:42161:0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE:1000000000000000000');
  });

  it('should generate correct balance key', () => {
    const key = CacheKeys.balance('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 8453);
    expect(key).toBe('balance:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045:8453');
  });

  it('should generate correct balances key with sorted chain IDs', () => {
    const key1 = CacheKeys.balances('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', [42161, 8453]);
    const key2 = CacheKeys.balances('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', [8453, 42161]);

    // Should be the same regardless of input order
    expect(key1).toBe(key2);
    // Numbers sort as: 42161, 8453 (lexicographic)
    expect(key1).toBe('balances:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045:42161,8453');
  });

  it('should generate correct gas price key', () => {
    expect(CacheKeys.gasPrice(8453)).toBe('gas:8453');
    expect(CacheKeys.gasPrice(42161)).toBe('gas:42161');
  });
});

describe('CacheTTL', () => {
  it('should have correct TTL values in seconds', () => {
    expect(CacheTTL.PRICE).toBe(300);           // 5 minutes
    expect(CacheTTL.BATCH_PRICES).toBe(300);    // 5 minutes
    expect(CacheTTL.QUOTE).toBe(30);            // 30 seconds
    expect(CacheTTL.BALANCE).toBe(60);          // 1 minute
    expect(CacheTTL.GAS_PRICE).toBe(10);        // 10 seconds
    expect(CacheTTL.ETH_PRICE).toBe(120);       // 2 minutes
  });

  it('should have consistent TTLs for related operations', () => {
    // Batch prices should have same TTL as single price
    expect(CacheTTL.BATCH_PRICES).toBe(CacheTTL.PRICE);

    // ETH price should be shorter than general price (more frequently used)
    expect(CacheTTL.ETH_PRICE).toBeLessThan(CacheTTL.PRICE);

    // Quotes should expire faster than prices (more volatile)
    expect(CacheTTL.QUOTE).toBeLessThan(CacheTTL.PRICE);

    // Gas prices should expire fastest (most volatile)
    expect(CacheTTL.GAS_PRICE).toBeLessThan(CacheTTL.QUOTE);
  });
});

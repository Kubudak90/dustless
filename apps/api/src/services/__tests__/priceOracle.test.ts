import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock undici BEFORE imports
vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { PriceOracle } from '../priceOracle.js';
import { mockPriceData } from '../../test/helpers.js';

describe('PriceOracle', () => {
  let oracle: PriceOracle;
  let mockRequest: any;

  beforeEach(async () => {
    oracle = new PriceOracle();
    const undici = await import('undici');
    mockRequest = undici.request as any;
    vi.clearAllMocks();
    oracle.clearCache();
  });

  afterEach(() => {
    oracle.clearCache();
  });

  describe('getETHPrice()', () => {
    it('should fetch ETH price from CoinGecko', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockPriceData,
        },
      });

      const price = await oracle.getETHPrice();

      expect(price).toBe(2000);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.stringContaining('ids=ethereum'),
        expect.any(Object)
      );
    });

    it('should cache ETH price', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockPriceData,
        },
      });

      const price1 = await oracle.getETHPrice();
      const price2 = await oracle.getETHPrice();

      expect(price1).toBe(price2);
      expect(mockRequest).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should use stale cache on API error', async () => {
      // First successful call
      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => mockPriceData,
        },
      });

      await oracle.getETHPrice();

      // Clear cache to simulate expiry
      const stats = oracle.getCacheStats();
      expect(stats.size).toBe(1);

      // Second call fails but uses stale cache
      mockRequest.mockResolvedValueOnce({
        statusCode: 500,
        body: {
          json: async () => ({}),
        },
      });

      const price = await oracle.getETHPrice();
      expect(price).toBe(2000); // Uses stale cache
    });

    it('should throw error when no cache and API fails', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 500,
        body: {
          json: async () => ({}),
        },
      });

      await expect(oracle.getETHPrice()).rejects.toThrow();
    });
  });

  describe('getTokenPrice()', () => {
    it('should return 1 for USDC', async () => {
      const price = await oracle.getTokenPrice('USDC');
      expect(price).toBe(1);
    });

    it('should return 1 for USDT', async () => {
      const price = await oracle.getTokenPrice('USDT');
      expect(price).toBe(1);
    });

    it('should return 1 for DAI', async () => {
      const price = await oracle.getTokenPrice('DAI');
      expect(price).toBe(1);
    });

    it('should return 1 when isStablecoin is true', async () => {
      const price = await oracle.getTokenPrice('UNKNOWN', true);
      expect(price).toBe(1);
    });

    it('should fetch price for ETH', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockPriceData,
        },
      });

      const price = await oracle.getTokenPrice('ETH');
      expect(price).toBe(2000);
    });

    it('should return 0 for unknown token symbol', async () => {
      const price = await oracle.getTokenPrice('UNKNOWN_TOKEN');
      expect(price).toBe(0);
    });
  });

  describe('calculateUSDValue()', () => {
    it('should calculate USD value from wei', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockPriceData,
        },
      });

      const usdValue = await oracle.calculateUSDValue('1000000000000000000'); // 1 ETH
      expect(usdValue).toBe(2000); // 1 ETH * $2000
    });

    it('should calculate USD value from bigint', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockPriceData,
        },
      });

      const usdValue = await oracle.calculateUSDValue(BigInt('500000000000000000')); // 0.5 ETH
      expect(usdValue).toBe(1000); // 0.5 ETH * $2000
    });

    it('should return 0 on error', async () => {
      mockRequest.mockRejectedValue(new Error('API error'));

      const usdValue = await oracle.calculateUSDValue('1000000000000000000');
      expect(usdValue).toBe(0);
    });
  });

  describe('calculateTokenUSDValue()', () => {
    it('should calculate USD value for ETH', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockPriceData,
        },
      });

      const usdValue = await oracle.calculateTokenUSDValue(
        '1000000000000000000',
        18,
        'ETH'
      );
      expect(usdValue).toBe(2000);
    });

    it('should calculate USD value for USDC', async () => {
      const usdValue = await oracle.calculateTokenUSDValue(
        '1000000',
        6,
        'USDC'
      );
      expect(usdValue).toBe(1); // 1 USDC = $1
    });

    it('should handle bigint balance', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockPriceData,
        },
      });

      const usdValue = await oracle.calculateTokenUSDValue(
        BigInt('2000000000000000000'),
        18,
        'ETH'
      );
      expect(usdValue).toBe(4000); // 2 ETH * $2000
    });

    it('should return 0 on error', async () => {
      mockRequest.mockRejectedValue(new Error('API error'));

      const usdValue = await oracle.calculateTokenUSDValue(
        '1000000000000000000',
        18,
        'UNKNOWN'
      );
      expect(usdValue).toBe(0);
    });

    it('should handle different decimals', async () => {
      const usdValue = await oracle.calculateTokenUSDValue(
        '5000000', // 5 USDC
        6,
        'USDC'
      );
      expect(usdValue).toBe(5);
    });
  });

  describe('getBatchPrices()', () => {
    it('should fetch multiple prices at once', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            ethereum: { usd: 2000 },
            bitcoin: { usd: 50000 },
          }),
        },
      });

      const prices = await oracle.getBatchPrices(['ethereum', 'bitcoin']);

      expect(prices).toEqual({
        ethereum: 2000,
        bitcoin: 50000,
      });
      // Check that the URL contains the coin IDs (may be URL encoded)
      const callUrl = mockRequest.mock.calls[0][0];
      expect(callUrl).toContain('ethereum');
      expect(callUrl).toContain('bitcoin');
    });

    it('should cache batch results', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            ethereum: { usd: 2000 },
            bitcoin: { usd: 50000 },
          }),
        },
      });

      await oracle.getBatchPrices(['ethereum', 'bitcoin']);

      const stats = oracle.getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.entries).toContain('ethereum');
      expect(stats.entries).toContain('bitcoin');
    });

    it('should return empty object on error', async () => {
      mockRequest.mockRejectedValue(new Error('API error'));

      const prices = await oracle.getBatchPrices(['ethereum', 'bitcoin']);
      expect(prices).toEqual({});
    });

    it('should handle API error status', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 429, // Rate limited
        body: {
          json: async () => ({}),
        },
      });

      const prices = await oracle.getBatchPrices(['ethereum']);
      expect(prices).toEqual({});
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockPriceData,
        },
      });

      await oracle.getETHPrice();
      expect(oracle.getCacheStats().size).toBe(1);

      oracle.clearCache();
      expect(oracle.getCacheStats().size).toBe(0);
    });

    it('should return cache statistics', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockPriceData,
        },
      });

      await oracle.getETHPrice();

      const stats = oracle.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.entries).toEqual(['ethereum']);
    });
  });

  describe('error handling', () => {
    it('should handle network timeout', async () => {
      const timeoutError = new Error('Timeout');
      timeoutError.name = 'AbortError';
      mockRequest.mockRejectedValue(timeoutError);

      await expect(oracle.getETHPrice()).rejects.toThrow();
    });

    it('should handle missing price data in response', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({}), // Empty response
        },
      });

      await expect(oracle.getETHPrice()).rejects.toThrow(
        'Failed to fetch price for ethereum and no cache available'
      );
    });

    it('should handle malformed JSON', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => {
            throw new Error('Invalid JSON');
          },
        },
      });

      await expect(oracle.getETHPrice()).rejects.toThrow();
    });
  });
});

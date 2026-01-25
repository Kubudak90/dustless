import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env BEFORE any imports
vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    BASESCAN_API_KEY: 'test-api-key',
    ARBISCAN_API_KEY: undefined,
  },
  isTest: true,
  isDevelopment: false,
}));

// Mock logger
vi.mock('../../config/logger.js', () => {
  const mockLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    logger: mockLogger,
    createLogger: vi.fn(() => mockLogger),
    loggers: {
      cache: mockLogger,
      price: mockLogger,
      gas: mockLogger,
      balance: mockLogger,
      quote: mockLogger,
      build: mockLogger,
      scan: mockLogger,
      swap: mockLogger,
      socket: mockLogger,
      lifi: mockLogger,
      socketProvider: mockLogger,
      across: mockLogger,
      odos: mockLogger,
      zora: mockLogger,
      dedup: mockLogger,
      rpc: mockLogger,
      sentry: mockLogger,
      providers: mockLogger,
    },
  };
});

// Mock undici
vi.mock('undici', () => ({
  request: vi.fn(),
}));

// Mock cache
vi.mock('../cache.js', () => ({
  cache: {
    isEnabled: vi.fn(() => false),
    get: vi.fn(() => null),
    set: vi.fn(),
  },
  CacheKeys: {
    explorerTokens: (chainId: number, address: string) => `explorer:${chainId}:${address}`,
  },
  CacheTTL: {
    EXPLORER_TOKENS: 600,
  },
}));

import { request } from 'undici';
import { discoverTokens, getTokenInfo, toTokenConfigs } from '../tokenDiscovery.js';
import { TEST_ADDRESS, TEST_CHAINS } from '../../test/helpers.js';

const mockRequest = vi.mocked(request);

describe('tokenDiscovery service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('discoverTokens()', () => {
    it('should return popular tokens for chain without explorer API key', async () => {
      // Arbitrum has no API key in mock
      const tokens = await discoverTokens(42161, TEST_ADDRESS);

      // Should only have popular tokens
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.every((t) => t.source === 'popular')).toBe(true);
      expect(mockRequest).not.toHaveBeenCalled();
    });

    it('should include popular tokens plus explorer tokens when API is available', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            status: '1',
            message: 'OK',
            result: [
              {
                contractAddress: '0x1111111111111111111111111111111111111111',
                tokenSymbol: 'TOKEN1',
                tokenName: 'Test Token 1',
                tokenDecimal: '18',
              },
              {
                contractAddress: '0x2222222222222222222222222222222222222222',
                tokenSymbol: 'TOKEN2',
                tokenName: 'Test Token 2',
                tokenDecimal: '6',
              },
            ],
          }),
        },
      });

      const tokens = await discoverTokens(TEST_CHAINS.BASE, TEST_ADDRESS);

      // Should have both popular and explorer tokens
      const popularTokens = tokens.filter((t) => t.source === 'popular');
      const explorerTokens = tokens.filter((t) => t.source === 'explorer');

      expect(popularTokens.length).toBeGreaterThan(0);
      expect(explorerTokens.length).toBe(2);
      expect(explorerTokens[0].symbol).toBe('TOKEN1');
      expect(explorerTokens[1].symbol).toBe('TOKEN2');
    });

    it('should not duplicate tokens found in both popular and explorer', async () => {
      // Return a token that's already in popular tokens (USDC on Base)
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            status: '1',
            message: 'OK',
            result: [
              {
                contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
                tokenSymbol: 'USDC',
                tokenName: 'USD Coin',
                tokenDecimal: '6',
              },
            ],
          }),
        },
      });

      const tokens = await discoverTokens(TEST_CHAINS.BASE, TEST_ADDRESS);

      // USDC should only appear once (from popular, not explorer)
      const usdcTokens = tokens.filter((t) => t.symbol === 'USDC');
      expect(usdcTokens.length).toBe(1);
      expect(usdcTokens[0].source).toBe('popular');
    });

    it('should handle explorer API error gracefully', async () => {
      mockRequest.mockRejectedValue(new Error('Network error'));

      const tokens = await discoverTokens(TEST_CHAINS.BASE, TEST_ADDRESS);

      // Should still return popular tokens
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.every((t) => t.source === 'popular')).toBe(true);
    });

    it('should handle explorer API non-200 response', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 500,
        body: {
          json: async () => ({}),
        },
      });

      const tokens = await discoverTokens(TEST_CHAINS.BASE, TEST_ADDRESS);

      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.every((t) => t.source === 'popular')).toBe(true);
    });

    it('should handle "No transactions found" gracefully', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            status: '0',
            message: 'No transactions found',
            result: [],
          }),
        },
      });

      const tokens = await discoverTokens(TEST_CHAINS.BASE, TEST_ADDRESS);

      // Should return popular tokens only
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.every((t) => t.source === 'popular')).toBe(true);
    });

    it('should filter out invalid token data from explorer', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            status: '1',
            message: 'OK',
            result: [
              {
                contractAddress: '0x1111111111111111111111111111111111111111',
                tokenSymbol: 'VALID',
                tokenName: 'Valid Token',
                tokenDecimal: '18',
              },
              {
                // Missing symbol
                contractAddress: '0x2222222222222222222222222222222222222222',
                tokenName: 'No Symbol Token',
                tokenDecimal: '18',
              },
              {
                // Invalid decimals
                contractAddress: '0x3333333333333333333333333333333333333333',
                tokenSymbol: 'INVALID',
                tokenName: 'Invalid Decimals',
                tokenDecimal: '25', // > 18
              },
            ],
          }),
        },
      });

      const tokens = await discoverTokens(TEST_CHAINS.BASE, TEST_ADDRESS);

      const explorerTokens = tokens.filter((t) => t.source === 'explorer');
      expect(explorerTokens.length).toBe(1);
      expect(explorerTokens[0].symbol).toBe('VALID');
    });

    it('should return empty array for unsupported chain', async () => {
      const tokens = await discoverTokens(999999, TEST_ADDRESS);

      expect(tokens).toEqual([]);
    });
  });

  describe('getTokenInfo()', () => {
    it('should return popular token info', async () => {
      const info = await getTokenInfo(
        TEST_CHAINS.BASE,
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // USDC on Base
      );

      expect(info).not.toBeNull();
      expect(info?.symbol).toBe('USDC');
      expect(info?.source).toBe('popular');
    });

    it('should return null for unknown token without user address', async () => {
      const info = await getTokenInfo(
        TEST_CHAINS.BASE,
        '0x1111111111111111111111111111111111111111'
      );

      expect(info).toBeNull();
    });

    it('should try explorer API when user address is provided', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            status: '1',
            message: 'OK',
            result: [
              {
                contractAddress: '0x1111111111111111111111111111111111111111',
                tokenSymbol: 'FOUND',
                tokenName: 'Found Token',
                tokenDecimal: '18',
              },
            ],
          }),
        },
      });

      const info = await getTokenInfo(
        TEST_CHAINS.BASE,
        '0x1111111111111111111111111111111111111111',
        TEST_ADDRESS
      );

      expect(info).not.toBeNull();
      expect(info?.symbol).toBe('FOUND');
      expect(info?.source).toBe('explorer');
    });
  });

  describe('toTokenConfigs()', () => {
    it('should convert discovered tokens to TokenConfig format', () => {
      const tokens = [
        { address: '0x1111', symbol: 'TOKEN1', name: 'Token 1', decimals: 18, source: 'popular' as const },
        { address: '0x2222', symbol: 'TOKEN2', name: 'Token 2', decimals: 6, source: 'explorer' as const },
      ];

      const configs = toTokenConfigs(tokens, TEST_CHAINS.BASE);

      expect(configs).toHaveLength(2);
      expect(configs[0]).toEqual({
        chainId: TEST_CHAINS.BASE,
        address: '0x1111',
        symbol: 'TOKEN1',
        name: 'Token 1',
        decimals: 18,
      });
      expect(configs[1]).toEqual({
        chainId: TEST_CHAINS.BASE,
        address: '0x2222',
        symbol: 'TOKEN2',
        name: 'Token 2',
        decimals: 6,
      });
    });

    it('should return empty array for empty input', () => {
      const configs = toTokenConfigs([], TEST_CHAINS.BASE);
      expect(configs).toEqual([]);
    });
  });
});

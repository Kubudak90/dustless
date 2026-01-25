import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env BEFORE any imports
vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
  },
  isTest: true,
  isDevelopment: false,
}));

// Mock undici
vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { AcrossProvider } from '../across.js';
import { request } from 'undici';

const mockRequest = vi.mocked(request);
import { NATIVE_TOKEN_ADDRESS } from '@dustless/shared';
import { TEST_ADDRESS, TEST_CHAINS } from '../../test/helpers.js';

describe('AcrossProvider', () => {
  let provider: AcrossProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AcrossProvider();
  });

  describe('name', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('across');
    });
  });

  describe('quote()', () => {
    const mockQuoteRequest = {
      fromChainId: TEST_CHAINS.BLAST,
      toChainId: TEST_CHAINS.BASE,
      tokenSymbol: 'ETH' as const,
      amountWei: '1000000000000000000', // 1 ETH
      fromAddress: TEST_ADDRESS,
    };

    it('should return quotes from Across API', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            relayerFeePct: '0.0003', // 0.03%
            relayerFeeTotalUsd: '0.60',
            destinationTokenUsdValue: '1999.40',
            estimatedTime: 180,
            timestamp: '1234567890',
            depositContract: '0x1234567890123456789012345678901234567890',
            depositCalldata: '0xabcdef',
          }),
          text: async () => '',
        },
      });

      const quotes = await provider.quote(mockQuoteRequest);

      expect(quotes).toHaveLength(1);
      expect(quotes[0]).toMatchObject({
        provider: 'across',
        routeId: expect.stringContaining('across:'),
        steps: [{
          fromChainId: TEST_CHAINS.BLAST,
          toChainId: TEST_CHAINS.BASE,
          tool: 'Across',
        }],
        estimatedTotalTimeSec: 180,
      });

      // Check URL was called correctly
      expect(mockRequest).toHaveBeenCalledWith(
        expect.stringContaining('api.across.to/api/v1/quote'),
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should calculate received amount correctly', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            relayerFeePct: '0.01', // 1%
            estimatedTime: 300,
            timestamp: '1234567890',
            depositContract: '0x1234',
            depositCalldata: '0x',
          }),
          text: async () => '',
        },
      });

      const quotes = await provider.quote(mockQuoteRequest);

      expect(quotes).toHaveLength(1);
      // 1 ETH - 1% = 0.99 ETH
      const received = BigInt(quotes[0].estimatedReceivedWei);
      expect(received).toBeLessThan(BigInt(mockQuoteRequest.amountWei));
    });

    it('should return empty array on API error', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 500,
        body: {
          json: async () => ({}),
          text: async () => 'Internal Server Error',
        },
      });

      const quotes = await provider.quote(mockQuoteRequest);

      expect(quotes).toEqual([]);
    });

    it('should return empty array when relayerFeePct is missing', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            // Missing relayerFeePct
            timestamp: '1234567890',
          }),
          text: async () => '',
        },
      });

      const quotes = await provider.quote(mockQuoteRequest);

      expect(quotes).toEqual([]);
    });

    it('should return empty array on network error', async () => {
      mockRequest.mockRejectedValue(new Error('Network error'));

      const quotes = await provider.quote(mockQuoteRequest);

      expect(quotes).toEqual([]);
    });

    it('should return empty array on timeout', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockRequest.mockRejectedValue(abortError);

      const quotes = await provider.quote(mockQuoteRequest);

      expect(quotes).toEqual([]);
    });

    it('should use default time when estimatedTime is not provided', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            relayerFeePct: '0.0003',
            timestamp: '1234567890',
            depositContract: '0x1234',
            depositCalldata: '0x',
            // No estimatedTime
          }),
          text: async () => '',
        },
      });

      const quotes = await provider.quote(mockQuoteRequest);

      expect(quotes[0].estimatedTotalTimeSec).toBe(300); // Default 5 minutes
    });
  });

  describe('build()', () => {
    const mockBuildRequest = {
      quote: {
        provider: 'across' as const,
        routeId: `across:${TEST_CHAINS.BLAST}:${TEST_CHAINS.BASE}:1000000000000000000:1234567890`,
        steps: [{
          fromChainId: TEST_CHAINS.BLAST,
          toChainId: TEST_CHAINS.BASE,
          tool: 'Across',
        }],
        estimatedReceivedWei: '990000000000000000',
        estimatedTotalTimeSec: 180,
      },
      userAddress: TEST_ADDRESS,
    };

    it('should build transaction from Across API', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            relayerFeePct: '0.0003',
            depositContract: '0x1234567890123456789012345678901234567890',
            depositCalldata: '0xabcdef1234567890',
            timestamp: '1234567890',
          }),
          text: async () => '',
        },
      });

      const steps = await provider.build(mockBuildRequest);

      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        chainId: TEST_CHAINS.BLAST,
        to: '0x1234567890123456789012345678901234567890',
        data: '0xabcdef1234567890',
        value: '1000000000000000000',
        description: 'Bridge via Across Protocol',
      });
    });

    it('should throw error for invalid route ID', async () => {
      const invalidRequest = {
        ...mockBuildRequest,
        quote: {
          ...mockBuildRequest.quote,
          routeId: 'invalid:route',
        },
      };

      await expect(provider.build(invalidRequest)).rejects.toThrow('Invalid Across route ID');
    });

    it('should throw error for malformed route format', async () => {
      const invalidRequest = {
        ...mockBuildRequest,
        quote: {
          ...mockBuildRequest.quote,
          routeId: 'across:123', // Missing parts
        },
      };

      await expect(provider.build(invalidRequest)).rejects.toThrow('Invalid Across route format');
    });

    it('should throw error on API failure', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 400,
        body: {
          json: async () => ({}),
          text: async () => 'Bad Request',
        },
      });

      await expect(provider.build(mockBuildRequest)).rejects.toThrow('Build failed');
    });

    it('should throw error when deposit data is missing', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            relayerFeePct: '0.0003',
            // Missing depositContract and depositCalldata
          }),
          text: async () => '',
        },
      });

      await expect(provider.build(mockBuildRequest)).rejects.toThrow('No transaction data');
    });

    it('should propagate network errors', async () => {
      mockRequest.mockRejectedValue(new Error('Connection refused'));

      await expect(provider.build(mockBuildRequest)).rejects.toThrow('Connection refused');
    });
  });
});

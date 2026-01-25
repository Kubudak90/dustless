import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env BEFORE importing provider
vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    LIFI_BASE_URL: 'https://li.quest/v1',
    LIFI_API_KEY: 'test-key',
    LOG_LEVEL: 'silent',
  },
  isTest: true,
  isDevelopment: false,
}));

// Mock undici
vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { LiFiProvider } from '../lifi.js';
import { TEST_ADDRESS, TEST_CHAINS, mockLiFiQuoteResponse } from '../../test/helpers.js';
import type { QuoteRequest, BuildRequest, Quote } from '@dustless/shared';

describe('LiFiProvider', () => {
  let provider: LiFiProvider;
  let mockRequest: any;

  beforeEach(async () => {
    provider = new LiFiProvider();
    const undici = await import('undici');
    mockRequest = undici.request as any;
    vi.clearAllMocks();
  });

  describe('quote()', () => {
    it('should return normalized quote for valid request', async () => {
      // Mock successful response
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockLiFiQuoteResponse,
          text: async () => JSON.stringify(mockLiFiQuoteResponse),
        },
      });

      const request: QuoteRequest = {
        fromChainId: TEST_CHAINS.BLAST,
        toChainId: TEST_CHAINS.BASE,
        tokenSymbol: 'ETH',
        amountWei: '1000000000000000000',
        fromAddress: TEST_ADDRESS,
      };

      const quotes = await provider.quote(request);

      expect(quotes).toHaveLength(1);
      expect(quotes[0]).toMatchObject({
        provider: 'lifi',
        estimatedReceivedWei: '990000000000000000',
        estimatedReceivedUsd: 1980,
        estimatedTotalFeeUsd: 20,
      });
      expect(quotes[0].steps).toHaveLength(1);
      expect(quotes[0].steps[0].tool).toBe('Stargate');
    });

    it('should return empty array on API error', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 500,
        body: {
          text: async () => 'Internal server error',
          json: async () => ({}),
        },
      });

      const request: QuoteRequest = {
        fromChainId: TEST_CHAINS.BLAST,
        toChainId: TEST_CHAINS.BASE,
        tokenSymbol: 'ETH',
        amountWei: '1000000000000000000',
        fromAddress: TEST_ADDRESS,
      };

      const quotes = await provider.quote(request);
      expect(quotes).toEqual([]);
    });

    it('should return empty array on network timeout', async () => {
      mockRequest.mockRejectedValue(new Error('Request timeout'));

      const request: QuoteRequest = {
        fromChainId: TEST_CHAINS.BLAST,
        toChainId: TEST_CHAINS.BASE,
        tokenSymbol: 'ETH',
        amountWei: '1000000000000000000',
        fromAddress: TEST_ADDRESS,
      };

      const quotes = await provider.quote(request);
      expect(quotes).toEqual([]);
    });

    it('should return empty array for invalid response without estimate', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({ id: 'test', type: 'lifi' }), // Missing estimate
          text: async () => '{}',
        },
      });

      const request: QuoteRequest = {
        fromChainId: TEST_CHAINS.BLAST,
        toChainId: TEST_CHAINS.BASE,
        tokenSymbol: 'ETH',
        amountWei: '1000000000000000000',
        fromAddress: TEST_ADDRESS,
      };

      const quotes = await provider.quote(request);
      expect(quotes).toEqual([]);
    });

    it('should construct correct API URL with parameters', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockLiFiQuoteResponse,
          text: async () => JSON.stringify(mockLiFiQuoteResponse),
        },
      });

      const request: QuoteRequest = {
        fromChainId: TEST_CHAINS.BLAST,
        toChainId: TEST_CHAINS.BASE,
        tokenSymbol: 'ETH',
        amountWei: '1000000000000000000',
        fromAddress: TEST_ADDRESS,
      };

      await provider.quote(request);

      expect(mockRequest).toHaveBeenCalledWith(
        expect.stringContaining('fromChain=81457'),
        expect.any(Object)
      );
      expect(mockRequest).toHaveBeenCalledWith(
        expect.stringContaining('toChain=8453'),
        expect.any(Object)
      );
      expect(mockRequest).toHaveBeenCalledWith(
        expect.stringContaining('fromAmount=1000000000000000000'),
        expect.any(Object)
      );
    });
  });

  describe('build()', () => {
    it('should build transaction for valid quote', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockLiFiQuoteResponse,
          text: async () => JSON.stringify(mockLiFiQuoteResponse),
        },
      });

      const quote: Quote = {
        provider: 'lifi',
        routeId: 'lifi:1000000000000000000:123456',
        steps: [
          {
            fromChainId: TEST_CHAINS.BLAST,
            toChainId: TEST_CHAINS.BASE,
            tool: 'Stargate',
            estimatedTimeSec: 120,
          },
        ],
        estimatedReceivedWei: '990000000000000000',
        estimatedReceivedUsd: 1980,
        estimatedTotalTimeSec: 120,
      };

      const buildRequest: BuildRequest = {
        quote,
        userAddress: TEST_ADDRESS,
      };

      const steps = await provider.build(buildRequest);

      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        chainId: TEST_CHAINS.BLAST,
        to: '0x1234567890123456789012345678901234567890',
        data: '0xabcdef',
        value: '1000000000000000000',
      });
      expect(steps[0].description).toContain('Stargate');
    });

    it('should throw error on API failure', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 400,
        body: {
          text: async () => 'Bad request',
          json: async () => ({}),
        },
      });

      const quote: Quote = {
        provider: 'lifi',
        routeId: 'lifi:1000000000000000000:123456',
        steps: [
          {
            fromChainId: TEST_CHAINS.BLAST,
            toChainId: TEST_CHAINS.BASE,
            tool: 'Stargate',
          },
        ],
        estimatedReceivedWei: '990000000000000000',
      };

      const buildRequest: BuildRequest = {
        quote,
        userAddress: TEST_ADDRESS,
      };

      await expect(provider.build(buildRequest)).rejects.toThrow();
    });

    it('should throw error when transaction data is missing', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            ...mockLiFiQuoteResponse,
            transactionRequest: undefined,
          }),
          text: async () => '{}',
        },
      });

      const quote: Quote = {
        provider: 'lifi',
        routeId: 'lifi:1000000000000000000:123456',
        steps: [
          {
            fromChainId: TEST_CHAINS.BLAST,
            toChainId: TEST_CHAINS.BASE,
            tool: 'Stargate',
          },
        ],
        estimatedReceivedWei: '990000000000000000',
      };

      const buildRequest: BuildRequest = {
        quote,
        userAddress: TEST_ADDRESS,
      };

      await expect(provider.build(buildRequest)).rejects.toThrow(
        'No transaction data in LI.FI response'
      );
    });
  });

  describe('provider name', () => {
    it('should have correct provider name', () => {
      expect(provider.name).toBe('lifi');
    });
  });
});

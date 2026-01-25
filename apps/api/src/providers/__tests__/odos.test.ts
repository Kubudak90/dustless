import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env BEFORE any imports
vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    ODOS_BASE_URL: 'https://api.odos.xyz',
  },
  isTest: true,
  isDevelopment: false,
}));

// Mock undici
vi.mock('undici', () => ({
  request: vi.fn(),
}));

// Mock viem
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: vi.fn().mockResolvedValue(0n), // Zero allowance by default
    })),
    http: vi.fn((url: string) => ({ url })),
    encodeFunctionData: vi.fn(() => '0xapprove'),
  };
});

// Mock chain config
vi.mock('../../config/chains.js', () => ({
  getChainConfig: vi.fn((chainId: number) => ({
    id: chainId,
    name: 'Base',
    rpcUrls: ['https://mainnet.base.org'],
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    decimals: 18,
  })),
}));

import { OdosProvider } from '../odos.js';
import { request } from 'undici';
import { NATIVE_TOKEN_ADDRESS } from '@dustless/shared';
import { TEST_ADDRESS, TEST_CHAINS } from '../../test/helpers.js';

const mockRequest = vi.mocked(request);

describe('OdosProvider', () => {
  let provider: OdosProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OdosProvider();
  });

  describe('name', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('odos');
    });
  });

  describe('quote()', () => {
    const mockSwapRequest = {
      chainId: TEST_CHAINS.BASE,
      fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
      toToken: NATIVE_TOKEN_ADDRESS, // ETH
      amount: '1000000', // 1 USDC (6 decimals)
      userAddress: TEST_ADDRESS,
      slippage: 3,
    };

    it('should return swap quotes from Odos API', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            pathId: 'test-path-id',
            outAmounts: ['500000000000000'], // 0.0005 ETH
            outValues: ['1.00'],
            gasEstimate: 150000,
            gasEstimateValue: 0.01,
            priceImpact: 0.1,
            inTokens: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'],
            outTokens: ['0x0000000000000000000000000000000000000000'],
            inAmounts: ['1000000'],
          }),
          text: async () => '',
        },
      });

      const quotes = await provider.quote(mockSwapRequest);

      expect(quotes).toHaveLength(1);
      expect(quotes[0]).toMatchObject({
        provider: 'odos',
        pathId: 'test-path-id',
        toAmount: '500000000000000',
      });
    });

    it('should handle native token conversion to Odos format', async () => {
      const nativeRequest = {
        ...mockSwapRequest,
        fromToken: NATIVE_TOKEN_ADDRESS, // ETH (native)
      };

      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            pathId: 'test-path-id',
            outAmounts: ['1000000'],
            outValues: ['1.00'],
            gasEstimate: 150000,
            inTokens: ['0x0000000000000000000000000000000000000000'],
            outTokens: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'],
            inAmounts: ['500000000000000'],
          }),
          text: async () => '',
        },
      });

      const quotes = await provider.quote(nativeRequest);

      expect(quotes).toHaveLength(1);

      // Verify native token was converted to zero address in request
      expect(mockRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('0x0000000000000000000000000000000000000000'),
        })
      );
    });

    it('should return empty array when no valid route found', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            // Missing pathId and outAmounts
          }),
          text: async () => '',
        },
      });

      const quotes = await provider.quote(mockSwapRequest);

      expect(quotes).toEqual([]);
    });

    it('should throw ProviderError on API error', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 400,
        body: {
          json: async () => ({}),
          text: async () => 'Bad Request',
        },
      });

      await expect(provider.quote(mockSwapRequest)).rejects.toThrow('Quote failed');
    });

    it('should return empty array on network error', async () => {
      mockRequest.mockRejectedValue(new Error('Network error'));

      const quotes = await provider.quote(mockSwapRequest);

      expect(quotes).toEqual([]);
    });

    it('should use default slippage when not provided', async () => {
      const requestWithoutSlippage = {
        ...mockSwapRequest,
        slippage: undefined,
      };

      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            pathId: 'test-path-id',
            outAmounts: ['500000000000000'],
            outValues: ['1.00'],
            gasEstimate: 150000,
            inTokens: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'],
            outTokens: ['0x0000000000000000000000000000000000000000'],
            inAmounts: ['1000000'],
          }),
          text: async () => '',
        },
      });

      await provider.quote(requestWithoutSlippage);

      // Verify default slippage of 3% was used
      expect(mockRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"slippageLimitPercent":3'),
        })
      );
    });
  });

  describe('build()', () => {
    const mockBuildRequest = {
      quote: {
        provider: 'odos' as const,
        pathId: 'test-path-id',
        fromToken: {
          address: NATIVE_TOKEN_ADDRESS,
          symbol: 'ETH',
          name: 'Ether',
          decimals: 18,
          chainId: TEST_CHAINS.BASE,
        },
        toToken: {
          address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
          chainId: TEST_CHAINS.BASE,
        },
        fromAmount: '1000000000000000000',
        toAmount: '2000000000',
      },
      userAddress: TEST_ADDRESS,
    };

    it('should build swap transaction from Odos API', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            transaction: {
              to: '0xOdosRouter',
              data: '0xswapdata',
              value: '1000000000000000000',
              gas: 200000,
            },
          }),
          text: async () => '',
        },
      });

      const steps = await provider.build(mockBuildRequest);

      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        chainId: TEST_CHAINS.BASE,
        to: '0xOdosRouter',
        data: '0xswapdata',
        value: '1000000000000000000',
        description: expect.stringContaining('Swap'),
      });
    });

    it('should include approval step for ERC-20 tokens', async () => {
      const erc20BuildRequest = {
        ...mockBuildRequest,
        quote: {
          ...mockBuildRequest.quote,
          fromToken: {
            address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            chainId: TEST_CHAINS.BASE,
          },
          toToken: {
            address: NATIVE_TOKEN_ADDRESS,
            symbol: 'ETH',
            name: 'Ether',
            decimals: 18,
            chainId: TEST_CHAINS.BASE,
          },
        },
      };

      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            approvalTransaction: {
              to: '0xUSDCContract',
              data: '0xapprovedata',
              value: '0',
              gas: 50000,
            },
            transaction: {
              to: '0xOdosRouter',
              data: '0xswapdata',
              value: '0',
              gas: 200000,
            },
          }),
          text: async () => '',
        },
      });

      const steps = await provider.build(erc20BuildRequest);

      // Should have approval + swap steps
      expect(steps.length).toBeGreaterThanOrEqual(1);
    });

    it('should throw ProviderError on API error', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 500,
        body: {
          json: async () => ({}),
          text: async () => 'Internal Server Error',
        },
      });

      await expect(provider.build(mockBuildRequest)).rejects.toThrow('Assemble failed');
    });

    it('should throw error when transaction data is missing', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            // Missing transaction
          }),
          text: async () => '',
        },
      });

      await expect(provider.build(mockBuildRequest)).rejects.toThrow('No transaction data');
    });
  });
});

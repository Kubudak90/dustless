import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env BEFORE any imports
vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    RPC_ZORA: 'https://rpc.zora.energy',
  },
  isTest: true,
  isDevelopment: false,
}));

// Mock viem
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getBalance: vi.fn().mockResolvedValue(1000000000000000000n),
    })),
    http: vi.fn((url: string) => ({ url })),
    encodeFunctionData: vi.fn(() => '0xencoded'),
  };
});

// Mock chain config
vi.mock('../../config/chains.js', () => ({
  getChainConfig: vi.fn((chainId: number) => ({
    id: chainId,
    name: chainId === 7777777 ? 'Zora' : 'Base',
    rpcUrls: [chainId === 7777777 ? 'https://rpc.zora.energy' : 'https://mainnet.base.org'],
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    decimals: 18,
  })),
}));

import { ZoraProvider } from '../zora.js';
import { TEST_ADDRESS, TEST_CHAINS } from '../../test/helpers.js';

describe('ZoraProvider', () => {
  let provider: ZoraProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ZoraProvider();
  });

  describe('name', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('zora');
    });
  });

  describe('quote()', () => {
    const ZORA_CHAIN_ID = 7777777;
    const BASE_CHAIN_ID = 8453;

    it('should return quote for Zora to Base bridge', async () => {
      const request = {
        fromChainId: ZORA_CHAIN_ID,
        toChainId: BASE_CHAIN_ID,
        tokenSymbol: 'ETH' as const,
        amountWei: '1000000000000000000', // 1 ETH
        fromAddress: TEST_ADDRESS,
      };

      const quotes = await provider.quote(request);

      expect(quotes).toHaveLength(1);
      expect(quotes[0]).toMatchObject({
        provider: 'zora',
        routeId: expect.stringContaining('zora:'),
        steps: [{
          fromChainId: ZORA_CHAIN_ID,
          toChainId: BASE_CHAIN_ID,
          tool: 'Zora Native Bridge',
          estimatedTimeSec: 120,
        }],
        estimatedTotalTimeSec: 120,
      });

      // Received amount should be less than sent (bridge fee deducted)
      const received = BigInt(quotes[0].estimatedReceivedWei);
      expect(received).toBeLessThan(BigInt(request.amountWei));
    });

    it('should return empty array for non-Base destination', async () => {
      const request = {
        fromChainId: ZORA_CHAIN_ID,
        toChainId: 42161, // Arbitrum (not Base)
        tokenSymbol: 'ETH' as const,
        amountWei: '1000000000000000000',
        fromAddress: TEST_ADDRESS,
      };

      const quotes = await provider.quote(request);

      expect(quotes).toEqual([]);
    });

    it('should return empty array for non-Zora source chain', async () => {
      const request = {
        fromChainId: 81457, // Blast (not Zora)
        toChainId: BASE_CHAIN_ID,
        tokenSymbol: 'ETH' as const,
        amountWei: '1000000000000000000',
        fromAddress: TEST_ADDRESS,
      };

      const quotes = await provider.quote(request);

      expect(quotes).toEqual([]);
    });

    it('should return empty array when amount is too small for bridge fee', async () => {
      const request = {
        fromChainId: ZORA_CHAIN_ID,
        toChainId: BASE_CHAIN_ID,
        tokenSymbol: 'ETH' as const,
        amountWei: '50000000000000', // 0.00005 ETH - less than bridge fee
        fromAddress: TEST_ADDRESS,
      };

      const quotes = await provider.quote(request);

      expect(quotes).toEqual([]);
    });

    it('should deduct bridge fee from estimated received amount', async () => {
      const amountWei = '1000000000000000000'; // 1 ETH
      const bridgeFee = BigInt('100000000000000'); // 0.0001 ETH

      const request = {
        fromChainId: ZORA_CHAIN_ID,
        toChainId: BASE_CHAIN_ID,
        tokenSymbol: 'ETH' as const,
        amountWei,
        fromAddress: TEST_ADDRESS,
      };

      const quotes = await provider.quote(request);

      const received = BigInt(quotes[0].estimatedReceivedWei);
      const expected = BigInt(amountWei) - bridgeFee;
      expect(received).toBe(expected);
    });

    it('should generate correct route ID format', async () => {
      const request = {
        fromChainId: ZORA_CHAIN_ID,
        toChainId: BASE_CHAIN_ID,
        tokenSymbol: 'ETH' as const,
        amountWei: '1000000000000000000',
        fromAddress: TEST_ADDRESS,
      };

      const quotes = await provider.quote(request);

      expect(quotes[0].routeId).toBe(`zora:${ZORA_CHAIN_ID}:${BASE_CHAIN_ID}:${request.amountWei}`);
    });
  });

  describe('build()', () => {
    const ZORA_CHAIN_ID = 7777777;
    const BASE_CHAIN_ID = 8453;
    const BASE_BRIDGE_CONTRACT = '0x4200000000000000000000000000000000000010';

    const mockBuildRequest = {
      quote: {
        provider: 'zora' as const,
        routeId: `zora:${ZORA_CHAIN_ID}:${BASE_CHAIN_ID}:1000000000000000000`,
        steps: [{
          fromChainId: ZORA_CHAIN_ID,
          toChainId: BASE_CHAIN_ID,
          tool: 'Zora Native Bridge',
        }],
        estimatedReceivedWei: '999900000000000000',
        estimatedTotalTimeSec: 120,
      },
      userAddress: TEST_ADDRESS,
    };

    it('should build bridge transaction', async () => {
      const steps = await provider.build(mockBuildRequest);

      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        chainId: ZORA_CHAIN_ID,
        to: BASE_BRIDGE_CONTRACT,
        data: '0x',
        value: '1000000000000000000',
        description: expect.stringContaining('Bridge ETH from Zora to Base'),
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

      await expect(provider.build(invalidRequest)).rejects.toThrow('Invalid Zora route ID');
    });

    it('should throw error for non-Base destination', async () => {
      const arbitrumRequest = {
        ...mockBuildRequest,
        quote: {
          ...mockBuildRequest.quote,
          routeId: `zora:${ZORA_CHAIN_ID}:42161:1000000000000000000`,
          steps: [{
            fromChainId: ZORA_CHAIN_ID,
            toChainId: 42161, // Arbitrum
            tool: 'Zora Native Bridge',
          }],
        },
      };

      await expect(provider.build(arbitrumRequest)).rejects.toThrow('Zora native bridge only supports Base (8453) as destination');
    });

    it('should throw error for non-Zora source chain', async () => {
      const blastRequest = {
        ...mockBuildRequest,
        quote: {
          ...mockBuildRequest.quote,
          routeId: `zora:81457:${BASE_CHAIN_ID}:1000000000000000000`,
          steps: [{
            fromChainId: 81457, // Blast (not Zora)
            toChainId: BASE_CHAIN_ID,
            tool: 'Zora Native Bridge',
          }],
        },
      };

      await expect(provider.build(blastRequest)).rejects.toThrow('Zora native bridge only supports Zora (7777777) as source');
    });

    it('should use correct amount from route ID', async () => {
      const smallAmountRequest = {
        ...mockBuildRequest,
        quote: {
          ...mockBuildRequest.quote,
          routeId: `zora:${ZORA_CHAIN_ID}:${BASE_CHAIN_ID}:500000000000000000`, // 0.5 ETH
        },
      };

      const steps = await provider.build(smallAmountRequest);

      expect(steps[0].value).toBe('500000000000000000');
    });

    it('should use empty data for native ETH transfer', async () => {
      const steps = await provider.build(mockBuildRequest);

      expect(steps[0].data).toBe('0x');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env BEFORE any imports
vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    RPC_BASE: 'https://mainnet.base.org',
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

// Mock chain config
vi.mock('../../config/chains.js', () => ({
  getChainConfig: vi.fn((chainId: number) => ({
    id: chainId,
    name: chainId === 8453 ? 'Base' : 'Blast',
    rpcUrls: ['https://mainnet.base.org'],
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    decimals: 18,
  })),
}));

// Mock provider registries
const mockBridgeProvider = {
  name: 'lifi',
  quote: vi.fn(),
  build: vi.fn(),
};

const mockSwapProvider = {
  name: 'odos',
  quote: vi.fn(),
  build: vi.fn(),
};

vi.mock('../../providers/index.js', () => ({
  registry: {
    all: vi.fn(() => [mockBridgeProvider]),
    get: vi.fn((name: string) => name === 'lifi' ? mockBridgeProvider : null),
  },
}));

vi.mock('../../providers/SwapProvider.js', () => ({
  swapRegistry: {
    all: vi.fn(() => [mockSwapProvider]),
    get: vi.fn((name: string) => name === 'odos' ? mockSwapProvider : null),
  },
}));

import { composeRoutes, buildComposedRoute } from '../routeComposer.js';
import { NATIVE_TOKEN_ADDRESS } from '@dustless/shared';
import { TEST_ADDRESS, TEST_CHAINS } from '../../test/helpers.js';

describe('routeComposer service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('composeRoutes()', () => {
    describe('with native token (direct bridge)', () => {
      it('should return bridge-only routes for native token', async () => {
        mockBridgeProvider.quote.mockResolvedValue([
          {
            provider: 'lifi',
            routeId: 'lifi:route:1',
            steps: [{ fromChainId: TEST_CHAINS.BLAST, toChainId: TEST_CHAINS.BASE, tool: 'Stargate' }],
            estimatedReceivedWei: '990000000000000000',
            estimatedTotalTimeSec: 300,
          },
        ]);

        const routes = await composeRoutes({
          fromChainId: TEST_CHAINS.BLAST,
          toChainId: TEST_CHAINS.BASE,
          fromToken: NATIVE_TOKEN_ADDRESS,
          amount: '1000000000000000000',
          userAddress: TEST_ADDRESS,
        });

        expect(routes).toHaveLength(1);
        expect(routes[0].id).toContain('direct:');
        expect(routes[0].swapQuote).toBeUndefined();
        expect(routes[0].bridgeQuote).toBeDefined();
        expect(routes[0].steps).toHaveLength(1);
        expect(routes[0].steps[0].type).toBe('bridge');
      });

      it('should return empty array when no bridge routes available', async () => {
        mockBridgeProvider.quote.mockResolvedValue([]);

        const routes = await composeRoutes({
          fromChainId: TEST_CHAINS.BLAST,
          toChainId: TEST_CHAINS.BASE,
          fromToken: NATIVE_TOKEN_ADDRESS,
          amount: '1000000000000000000',
          userAddress: TEST_ADDRESS,
        });

        expect(routes).toEqual([]);
      });
    });

    describe('with ERC-20 token (swap + bridge)', () => {
      const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

      it('should compose swap + bridge routes for ERC-20 token', async () => {
        mockSwapProvider.quote.mockResolvedValue([
          {
            provider: 'odos',
            pathId: 'odos:path:1',
            fromToken: { address: USDC_ADDRESS, symbol: 'USDC', name: 'USD Coin', decimals: 6, chainId: TEST_CHAINS.BLAST },
            toToken: { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH', name: 'Ether', decimals: 18, chainId: TEST_CHAINS.BLAST },
            fromAmount: '1000000',
            toAmount: '500000000000000', // 0.0005 ETH
          },
        ]);

        mockBridgeProvider.quote.mockResolvedValue([
          {
            provider: 'lifi',
            routeId: 'lifi:route:1',
            steps: [{ fromChainId: TEST_CHAINS.BLAST, toChainId: TEST_CHAINS.BASE, tool: 'Stargate' }],
            estimatedReceivedWei: '490000000000000',
            estimatedTotalTimeSec: 300,
          },
        ]);

        const routes = await composeRoutes({
          fromChainId: TEST_CHAINS.BLAST,
          toChainId: TEST_CHAINS.BASE,
          fromToken: USDC_ADDRESS,
          amount: '1000000',
          userAddress: TEST_ADDRESS,
        });

        expect(routes).toHaveLength(1);
        expect(routes[0].id).toContain('multihop:');
        expect(routes[0].swapQuote).toBeDefined();
        expect(routes[0].swapQuote?.pathId).toBe('odos:path:1');
        expect(routes[0].bridgeQuote).toBeDefined();
        expect(routes[0].steps).toHaveLength(2);
        expect(routes[0].steps[0].type).toBe('swap');
        expect(routes[0].steps[1].type).toBe('bridge');
      });

      it('should return empty array when no swap quotes available', async () => {
        mockSwapProvider.quote.mockResolvedValue([]);

        const routes = await composeRoutes({
          fromChainId: TEST_CHAINS.BLAST,
          toChainId: TEST_CHAINS.BASE,
          fromToken: USDC_ADDRESS,
          amount: '1000000',
          userAddress: TEST_ADDRESS,
        });

        expect(routes).toEqual([]);
      });

      it('should return empty array when swap succeeds but no bridge routes', async () => {
        mockSwapProvider.quote.mockResolvedValue([
          {
            provider: 'odos',
            pathId: 'odos:path:1',
            fromToken: { address: USDC_ADDRESS, symbol: 'USDC', name: 'USD Coin', decimals: 6, chainId: TEST_CHAINS.BLAST },
            toToken: { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH', name: 'Ether', decimals: 18, chainId: TEST_CHAINS.BLAST },
            fromAmount: '1000000',
            toAmount: '500000000000000',
          },
        ]);

        mockBridgeProvider.quote.mockResolvedValue([]);

        const routes = await composeRoutes({
          fromChainId: TEST_CHAINS.BLAST,
          toChainId: TEST_CHAINS.BASE,
          fromToken: USDC_ADDRESS,
          amount: '1000000',
          userAddress: TEST_ADDRESS,
        });

        expect(routes).toEqual([]);
      });

      it('should sort routes by best output', async () => {
        mockSwapProvider.quote.mockResolvedValue([
          {
            provider: 'odos',
            pathId: 'odos:path:1',
            fromToken: { address: USDC_ADDRESS, symbol: 'USDC', name: 'USD Coin', decimals: 6, chainId: TEST_CHAINS.BLAST },
            toToken: { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH', name: 'Ether', decimals: 18, chainId: TEST_CHAINS.BLAST },
            fromAmount: '1000000',
            toAmount: '500000000000000',
          },
        ]);

        mockBridgeProvider.quote.mockResolvedValue([
          {
            provider: 'lifi',
            routeId: 'lifi:route:1',
            steps: [{ fromChainId: TEST_CHAINS.BLAST, toChainId: TEST_CHAINS.BASE, tool: 'Stargate' }],
            estimatedReceivedWei: '400000000000000', // Worse
            estimatedTotalTimeSec: 300,
          },
          {
            provider: 'lifi',
            routeId: 'lifi:route:2',
            steps: [{ fromChainId: TEST_CHAINS.BLAST, toChainId: TEST_CHAINS.BASE, tool: 'Hop' }],
            estimatedReceivedWei: '490000000000000', // Better
            estimatedTotalTimeSec: 200,
          },
        ]);

        const routes = await composeRoutes({
          fromChainId: TEST_CHAINS.BLAST,
          toChainId: TEST_CHAINS.BASE,
          fromToken: USDC_ADDRESS,
          amount: '1000000',
          userAddress: TEST_ADDRESS,
        });

        expect(routes).toHaveLength(2);
        // Best route should be first
        expect(routes[0].estimatedReceivedWei).toBe('490000000000000');
        expect(routes[1].estimatedReceivedWei).toBe('400000000000000');
      });
    });
  });

  describe('buildComposedRoute()', () => {
    it('should build bridge-only route', async () => {
      mockBridgeProvider.build.mockResolvedValue([
        {
          chainId: TEST_CHAINS.BLAST,
          to: '0x1234567890123456789012345678901234567890',
          data: '0xbridge',
          value: '1000000000000000000',
          description: 'Bridge via Stargate',
        },
      ]);

      const route = {
        id: 'direct:lifi:route:1',
        bridgeQuote: {
          provider: 'lifi' as const,
          routeId: 'lifi:route:1',
          steps: [{ fromChainId: TEST_CHAINS.BLAST, toChainId: TEST_CHAINS.BASE, tool: 'Stargate' }],
          estimatedReceivedWei: '990000000000000000',
          estimatedTotalTimeSec: 300,
        },
        estimatedReceivedWei: '990000000000000000',
        estimatedTotalTimeSec: 300,
        steps: [
          { type: 'bridge' as const, chainId: TEST_CHAINS.BLAST, fromToken: NATIVE_TOKEN_ADDRESS, toToken: NATIVE_TOKEN_ADDRESS, tool: 'Stargate' },
        ],
      };

      const steps = await buildComposedRoute(route, TEST_ADDRESS);

      expect(steps).toHaveLength(1);
      expect(steps[0].description).toContain('Bridge');
      expect(mockBridgeProvider.build).toHaveBeenCalledWith({
        quote: route.bridgeQuote,
        userAddress: TEST_ADDRESS,
      });
    });

    it('should build swap + bridge route', async () => {
      const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

      mockSwapProvider.build.mockResolvedValue([
        {
          chainId: TEST_CHAINS.BLAST,
          to: '0xOdosRouter',
          data: '0xswap',
          value: '0',
          description: 'Swap USDC → ETH',
        },
      ]);

      mockBridgeProvider.build.mockResolvedValue([
        {
          chainId: TEST_CHAINS.BLAST,
          to: '0xBridgeContract',
          data: '0xbridge',
          value: '500000000000000',
          description: 'Bridge via Stargate',
        },
      ]);

      const route = {
        id: 'multihop:odos:path:1:lifi:route:1',
        swapQuote: {
          provider: 'odos' as const,
          pathId: 'odos:path:1',
          fromToken: { address: USDC_ADDRESS, symbol: 'USDC', name: 'USD Coin', decimals: 6, chainId: TEST_CHAINS.BLAST },
          toToken: { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH', name: 'Ether', decimals: 18, chainId: TEST_CHAINS.BLAST },
          fromAmount: '1000000',
          toAmount: '500000000000000',
        },
        bridgeQuote: {
          provider: 'lifi' as const,
          routeId: 'lifi:route:1',
          steps: [{ fromChainId: TEST_CHAINS.BLAST, toChainId: TEST_CHAINS.BASE, tool: 'Stargate' }],
          estimatedReceivedWei: '490000000000000',
          estimatedTotalTimeSec: 300,
        },
        estimatedReceivedWei: '490000000000000',
        estimatedTotalTimeSec: 330,
        steps: [
          { type: 'swap' as const, chainId: TEST_CHAINS.BLAST, fromToken: USDC_ADDRESS, toToken: NATIVE_TOKEN_ADDRESS, tool: 'Odos' },
          { type: 'bridge' as const, chainId: TEST_CHAINS.BLAST, fromToken: NATIVE_TOKEN_ADDRESS, toToken: NATIVE_TOKEN_ADDRESS, tool: 'Stargate' },
        ],
      };

      const steps = await buildComposedRoute(route, TEST_ADDRESS);

      expect(steps).toHaveLength(2);
      expect(steps[0].description).toContain('Swap');
      expect(steps[1].description).toContain('Bridge');
      expect(mockSwapProvider.build).toHaveBeenCalled();
      expect(mockBridgeProvider.build).toHaveBeenCalled();
    });

    it('should throw error for unknown bridge provider', async () => {
      const route = {
        id: 'direct:unknown:route:1',
        bridgeQuote: {
          provider: 'unknown' as any,
          routeId: 'unknown:route:1',
          steps: [],
          estimatedReceivedWei: '0',
          estimatedTotalTimeSec: 0,
        },
        estimatedReceivedWei: '0',
        estimatedTotalTimeSec: 0,
        steps: [],
      };

      await expect(buildComposedRoute(route, TEST_ADDRESS)).rejects.toThrow(
        'Unknown bridge provider: unknown'
      );
    });
  });
});

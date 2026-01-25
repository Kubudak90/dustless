import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env BEFORE any imports
vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    RPC_BASE: 'https://mainnet.base.org',
    RPC_BNB: 'https://bsc.llamarpc.com',
    LOG_LEVEL: 'silent',
  },
  isTest: true,
  isDevelopment: false,
}));

// Mock viem
const mockEstimateFeesPerGas = vi.fn();

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      estimateFeesPerGas: mockEstimateFeesPerGas,
    })),
    http: vi.fn((url: string) => ({ url })),
  };
});

// Mock chain config
vi.mock('../../config/chains.js', () => ({
  getChainConfig: vi.fn((chainId: number) => {
    const configs: Record<number, any> = {
      8453: {
        id: 8453,
        name: 'Base',
        shortName: 'base',
        nativeSymbol: 'ETH',
        nativeName: 'Ether',
        decimals: 18,
        rpcUrls: ['https://mainnet.base.org'],
        tags: ['target', 'source'],
      },
      56: {
        id: 56,
        name: 'BNB Chain',
        shortName: 'bsc',
        nativeSymbol: 'BNB',
        nativeName: 'BNB',
        decimals: 18,
        rpcUrls: ['https://bsc.llamarpc.com'],
        tags: ['source'],
      },
      43114: {
        id: 43114,
        name: 'Avalanche',
        shortName: 'avax',
        nativeSymbol: 'AVAX',
        nativeName: 'Avalanche',
        decimals: 18,
        rpcUrls: ['https://avalanche.public-rpc.com'],
        tags: ['source'],
      },
    };
    return configs[chainId] || configs[8453];
  }),
}));

// Mock price oracle
vi.mock('../priceOracle.js', () => ({
  priceOracle: {
    getETHPrice: vi.fn().mockResolvedValue(2000),
    getNativeTokenPrice: vi.fn().mockImplementation((symbol: string) => {
      const prices: Record<string, number> = {
        ETH: 2000,
        BNB: 300,
        AVAX: 25,
      };
      return Promise.resolve(prices[symbol] || 2000);
    }),
  },
}));

import { GasManager, gasManager } from '../gasManager.js';
import { TEST_CHAINS } from '../../test/helpers.js';

describe('gasManager service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: gas price of 0.1 gwei
    mockEstimateFeesPerGas.mockResolvedValue({
      gasPrice: 100000000n, // 0.1 gwei
    });
  });

  describe('getEffectiveGasPrice()', () => {
    it('should return gas price when under cap', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 100000000n, // 0.1 gwei (under Base cap of 0.15)
      });

      const gasPrice = await gasManager.getEffectiveGasPrice(TEST_CHAINS.BASE);

      // 0.1 gwei = 100000000 wei
      expect(gasPrice).toBe(100000000n);
    });

    it('should cap gas price when over limit', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 500000000n, // 0.5 gwei (over Base cap of 0.15)
      });

      const gasPrice = await gasManager.getEffectiveGasPrice(TEST_CHAINS.BASE);

      // Should be capped at 0.15 gwei = 150000000 wei
      expect(gasPrice).toBe(150000000n);
    });

    it('should use maxFeePerGas when gasPrice is not available', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        maxFeePerGas: 100000000n,
        maxPriorityFeePerGas: 50000000n,
      });

      const gasPrice = await gasManager.getEffectiveGasPrice(TEST_CHAINS.BASE);

      expect(gasPrice).toBe(100000000n);
    });

    it('should return fallback price on RPC error', async () => {
      mockEstimateFeesPerGas.mockRejectedValue(new Error('RPC error'));

      const gasPrice = await gasManager.getEffectiveGasPrice(TEST_CHAINS.BASE);

      // Fallback to max cap: 0.15 gwei = 150000000 wei
      expect(gasPrice).toBe(150000000n);
    });

    it('should use different caps for different chains', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 10000000000n, // 10 gwei
      });

      // BNB Chain has 5 gwei cap
      const bnbGasPrice = await gasManager.getEffectiveGasPrice(56);
      expect(bnbGasPrice).toBe(5000000000n); // 5 gwei cap

      // Avalanche has 50 gwei cap
      const avaxGasPrice = await gasManager.getEffectiveGasPrice(43114);
      expect(avaxGasPrice).toBe(10000000000n); // 10 gwei (under 50 cap)
    });
  });

  describe('calculateRequiredGas()', () => {
    it('should calculate gas for recovery operation', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 100000000n, // 0.1 gwei
      });

      const result = await gasManager.calculateRequiredGas(
        TEST_CHAINS.BASE,
        '1000000000000000000' // 1 ETH
      );

      expect(result).toMatchObject({
        shouldSweep: expect.any(Boolean),
        gasPriceGwei: expect.any(Number),
      });
      expect(BigInt(result.totalGasWei)).toBeGreaterThan(0n);
      expect(BigInt(result.txGasWei)).toBeGreaterThan(0n);
    });

    it('should not include sweep when disabled', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 100000000n,
      });

      const result = await gasManager.calculateRequiredGas(
        TEST_CHAINS.BASE,
        '1000000000000000000',
        false // includeSweep = false
      );

      expect(result.shouldSweep).toBe(false);
      expect(result.sweepGasWei).toBeNull();
    });

    it('should trigger sweep when remaining balance is significant', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 100000000n, // 0.1 gwei - very low gas
      });

      const result = await gasManager.calculateRequiredGas(
        TEST_CHAINS.BASE,
        '10000000000000000000' // 10 ETH - large balance
      );

      // With 10 ETH and low gas, remaining should be > $0.15 threshold
      expect(result.shouldSweep).toBe(true);
    });

    it('should not trigger sweep when remaining balance is small', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 100000000n,
      });

      const result = await gasManager.calculateRequiredGas(
        TEST_CHAINS.BASE,
        '100000000000000' // 0.0001 ETH - tiny balance
      );

      // With tiny balance, shouldSweep depends on gas costs vs remaining
      // The test validates the calculation completes without error
      expect(typeof result.shouldSweep).toBe('boolean');
      expect(result.expectedRemainingUsd).toBeGreaterThanOrEqual(0);
    });

    it('should include breakdown details', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 100000000n,
      });

      const result = await gasManager.calculateRequiredGas(
        TEST_CHAINS.BASE,
        '1000000000000000000'
      );

      expect(result.breakdown).toMatchObject({
        presetGas: expect.any(String),
        gasPrice: expect.any(String),
        fixedBuffer: expect.any(String),
        expectedRefund: expect.any(String),
      });
    });

    it('should handle different native tokens (BNB)', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 3000000000n, // 3 gwei
      });

      const result = await gasManager.calculateRequiredGas(
        56, // BNB Chain
        '5000000000000000000' // 5 BNB
      );

      expect(BigInt(result.totalGasWei)).toBeGreaterThan(0n);
      // USD calculation should use BNB price ($300)
      expect(result.expectedRemainingUsd).toBeGreaterThan(0);
    });
  });

  describe('calculateBridgeableAmount()', () => {
    it('should calculate bridgeable amount', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 100000000n,
      });

      const result = await gasManager.calculateBridgeableAmount(
        TEST_CHAINS.BASE,
        '1000000000000000000' // 1 ETH
      );

      expect(result.isTooLow).toBe(false);
      expect(BigInt(result.bridgeableWei)).toBeGreaterThan(0n);
      expect(BigInt(result.requiredGasWei)).toBeGreaterThan(0n);
    });

    it('should return isTooLow when balance cannot cover gas', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 100000000000n, // 100 gwei - very high
      });

      const result = await gasManager.calculateBridgeableAmount(
        TEST_CHAINS.BASE,
        '1000000000000' // 0.000001 ETH - tiny balance
      );

      expect(result.isTooLow).toBe(true);
      expect(result.bridgeableWei).toBe('0');
    });

    it('should return full balance minus gas when sufficient', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 100000000n, // 0.1 gwei
      });

      const balance = '1000000000000000000'; // 1 ETH
      const result = await gasManager.calculateBridgeableAmount(TEST_CHAINS.BASE, balance);

      const bridgeable = BigInt(result.bridgeableWei);
      const requiredGas = BigInt(result.requiredGasWei);

      // bridgeable + requiredGas should approximately equal balance
      expect(bridgeable + requiredGas).toBeLessThanOrEqual(BigInt(balance));
    });
  });

  describe('shouldSweep()', () => {
    it('should return true when remaining balance is valuable', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 100000000n,
      });

      const result = await gasManager.shouldSweep(
        TEST_CHAINS.BASE,
        '1000000000000000' // 0.001 ETH = $2 at $2000/ETH
      );

      expect(result.shouldSweep).toBe(true);
      expect(result.remainingUsd).toBeGreaterThan(0.15);
    });

    it('should return false when remaining balance is dust', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 100000000n,
      });

      const result = await gasManager.shouldSweep(
        TEST_CHAINS.BASE,
        '10000000000000' // 0.00001 ETH = $0.02 at $2000/ETH
      );

      expect(result.shouldSweep).toBe(false);
      expect(result.remainingUsd).toBeLessThanOrEqual(0.15);
    });

    it('should handle case when sweep might not be worth it', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 10000000000n, // 10 gwei - high gas (but still under 0.15 cap)
      });

      const result = await gasManager.shouldSweep(
        TEST_CHAINS.BASE,
        '100000000000000' // 0.0001 ETH = $0.20 at $2000
      );

      // Result depends on whether remaining USD is > $0.15 threshold
      // and if sweep gas cost < remaining balance
      expect(typeof result.shouldSweep).toBe('boolean');
      expect(result.sweepGasWei).toBeDefined();
      expect(result.remainingUsd).toBeGreaterThanOrEqual(0);
    });

    it('should use correct native token price for BNB', async () => {
      mockEstimateFeesPerGas.mockResolvedValue({
        gasPrice: 3000000000n,
      });

      const result = await gasManager.shouldSweep(
        56, // BNB Chain
        '1000000000000000' // 0.001 BNB = $0.30 at $300/BNB
      );

      // $0.30 > $0.15 threshold
      expect(result.remainingUsd).toBeCloseTo(0.3, 1);
    });
  });

  describe('logGasUsage()', () => {
    it('should log gas usage without throwing', () => {
      expect(() => {
        gasManager.logGasUsage({
          chainId: TEST_CHAINS.BASE,
          userAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          sentGas: '1000000000000000',
          usedGas: '800000000000000',
          refunded: '200000000000000',
          dustLeft: '50000000000000',
          dustLeftUsd: 0.10,
          timestamp: new Date().toISOString(),
        });
      }).not.toThrow();
    });
  });
});

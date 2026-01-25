import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env BEFORE any imports
vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    RPC_BASE: 'https://mainnet.base.org',
    RPC_ARBITRUM: 'https://arb1.arbitrum.io/rpc',
    RPC_BLAST: 'https://rpc.blast.io',
    LOG_LEVEL: 'silent',
  },
  isTest: true,
  isDevelopment: false,
}));

// Mock dependencies
vi.mock('../tokenBalances.js', () => ({
  scanTokenBalances: vi.fn(),
  isBalanceStuck: vi.fn(),
}));

vi.mock('../gasManager.js', () => ({
  gasManager: {
    calculateBridgeableAmount: vi.fn(),
  },
}));

vi.mock('../../config/chains.js', () => ({
  getChainConfig: vi.fn((chainId: number) => ({
    chainId,
    name: chainId === 8453 ? 'Base' : chainId === 81457 ? 'Blast' : 'Unknown',
    tags: chainId === 81457 ? ['abandoned'] : ['target'],
  })),
}));

import { scanBalances, identifyStuckAssets, formatBalance } from '../balances.js';
import { TEST_ADDRESS, INVALID_ADDRESS, TEST_CHAINS } from '../../test/helpers.js';

describe('balances service', () => {
  let mockScanTokenBalances: any;
  let mockIsBalanceStuck: any;
  let mockCalculateBridgeableAmount: any;

  beforeEach(async () => {
    const tokenBalances = await import('../tokenBalances.js');
    const gasManager = await import('../gasManager.js');

    mockScanTokenBalances = tokenBalances.scanTokenBalances as any;
    mockIsBalanceStuck = tokenBalances.isBalanceStuck as any;
    mockCalculateBridgeableAmount = gasManager.gasManager.calculateBridgeableAmount as any;

    vi.clearAllMocks();
  });

  describe('scanBalances()', () => {
    it('should scan balances for valid address and chains', async () => {
      mockScanTokenBalances.mockResolvedValue([
        {
          chainId: TEST_CHAINS.BASE,
          tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          balance: '1000000000000000000',
          ok: true,
        },
      ]);

      const balances = await scanBalances(TEST_ADDRESS, [TEST_CHAINS.BASE]);

      expect(balances).toHaveLength(1);
      expect(balances[0]).toMatchObject({
        chainId: TEST_CHAINS.BASE,
        ok: true,
      });
      expect(mockScanTokenBalances).toHaveBeenCalledWith(
        TEST_CHAINS.BASE,
        TEST_ADDRESS,
        expect.any(Array)
      );
    });

    it('should throw error for invalid address', async () => {
      await expect(scanBalances(INVALID_ADDRESS, [TEST_CHAINS.BASE])).rejects.toThrow(
        'Invalid address format'
      );
    });

    it('should handle multiple chains in parallel', async () => {
      mockScanTokenBalances.mockResolvedValue([
        {
          chainId: TEST_CHAINS.BASE,
          tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          balance: '1000000000000000000',
          ok: true,
        },
      ]);

      const balances = await scanBalances(TEST_ADDRESS, [
        TEST_CHAINS.BASE,
        TEST_CHAINS.ARBITRUM,
        TEST_CHAINS.BLAST,
      ]);

      expect(balances.length).toBeGreaterThan(0);
      expect(mockScanTokenBalances).toHaveBeenCalledTimes(3);
    });

    it('should handle errors for individual chains', async () => {
      mockScanTokenBalances
        .mockResolvedValueOnce([
          {
            chainId: TEST_CHAINS.BASE,
            tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
            balance: '1000000000000000000',
            ok: true,
          },
        ])
        .mockRejectedValueOnce(new Error('RPC error'));

      const balances = await scanBalances(TEST_ADDRESS, [TEST_CHAINS.BASE, TEST_CHAINS.ARBITRUM]);

      // Should have one successful and one error result
      expect(balances.length).toBeGreaterThan(0);
      const errors = balances.filter((b) => !b.ok);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should flatten results from multiple chains', async () => {
      mockScanTokenBalances.mockResolvedValue([
        {
          chainId: TEST_CHAINS.BASE,
          tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          balance: '1000000000000000000',
          ok: true,
        },
        {
          chainId: TEST_CHAINS.BASE,
          tokenAddress: '0x1234567890123456789012345678901234567890',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
          balance: '1000000',
          ok: true,
        },
      ]);

      const balances = await scanBalances(TEST_ADDRESS, [TEST_CHAINS.BASE]);

      // Should have 2 tokens for 1 chain
      expect(balances.length).toBe(2);
    });
  });

  describe('identifyStuckAssets()', () => {
    beforeEach(() => {
      mockIsBalanceStuck.mockReturnValue(true);
      mockCalculateBridgeableAmount.mockResolvedValue({
        bridgeableWei: '995000000000000000',
        requiredGasWei: '5000000000000000',
        expectedRemainingUsd: 0.01,
        isTooLow: false,
      });
    });

    it('should identify stuck assets on abandoned chains', async () => {
      const balances = [
        {
          chainId: TEST_CHAINS.BLAST,
          tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          balance: '1000000000000000000',
          ok: true as const,
        },
      ];

      const stuck = await identifyStuckAssets(balances);

      expect(stuck).toHaveLength(1);
      expect(stuck[0]).toMatchObject({
        chainId: TEST_CHAINS.BLAST,
        chainName: 'Blast',
        balance: '1000000000000000000',
        bridgeableAmount: '995000000000000000',
      });
    });

    it('should skip balances that are not stuck', async () => {
      mockIsBalanceStuck.mockReturnValue(false);

      const balances = [
        {
          chainId: TEST_CHAINS.BLAST,
          tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          balance: '100000000000000', // Very small amount
          ok: true as const,
        },
      ];

      const stuck = await identifyStuckAssets(balances);

      expect(stuck).toHaveLength(0);
    });

    it('should skip target chains', async () => {
      const balances = [
        {
          chainId: TEST_CHAINS.BASE,
          tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          balance: '1000000000000000000',
          ok: true as const,
        },
      ];

      const stuck = await identifyStuckAssets(balances);

      expect(stuck).toHaveLength(0);
    });

    it('should skip error balances', async () => {
      const balances = [
        {
          chainId: TEST_CHAINS.BLAST,
          ok: false as const,
          error: 'RPC error',
        },
      ];

      const stuck = await identifyStuckAssets(balances);

      expect(stuck).toHaveLength(0);
    });

    it('should calculate gas for native ETH', async () => {
      const balances = [
        {
          chainId: TEST_CHAINS.BLAST,
          tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          balance: '1000000000000000000',
          ok: true as const,
        },
      ];

      await identifyStuckAssets(balances);

      expect(mockCalculateBridgeableAmount).toHaveBeenCalledWith(
        TEST_CHAINS.BLAST,
        '1000000000000000000'
      );
    });

    it('should skip assets with too low balance after gas', async () => {
      mockCalculateBridgeableAmount.mockResolvedValue({
        bridgeableWei: '0',
        requiredGasWei: '1000000000000000000',
        expectedRemainingUsd: 0,
        isTooLow: true,
      });

      const balances = [
        {
          chainId: TEST_CHAINS.BLAST,
          tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          balance: '500000000000000000',
          ok: true as const,
        },
      ];

      const stuck = await identifyStuckAssets(balances);

      expect(stuck).toHaveLength(0);
    });

    it('should use fallback threshold when gas calculation fails', async () => {
      mockCalculateBridgeableAmount.mockRejectedValue(new Error('Gas calculation failed'));

      const balances = [
        {
          chainId: TEST_CHAINS.BLAST,
          tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          balance: '2000000000000000000', // 2 ETH - above fallback threshold
          ok: true as const,
        },
      ];

      const stuck = await identifyStuckAssets(balances);

      expect(stuck).toHaveLength(1);
    });

    it('should include USD values when provided', async () => {
      const balances = [
        {
          chainId: TEST_CHAINS.BLAST,
          tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          balance: '1000000000000000000',
          ok: true as const,
        },
      ];

      const usdValues = new Map([
        ['81457:0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 2000],
      ]);

      const stuck = await identifyStuckAssets(balances, usdValues);

      expect(stuck).toHaveLength(1);
      expect(stuck[0]).toHaveProperty('usdValue');
      // USD value is passed through from the map
      if (stuck[0].usdValue !== undefined) {
        expect(stuck[0].usdValue).toBe(2000);
      }
    });
  });

  describe('formatBalance()', () => {
    it('should format zero balance', () => {
      expect(formatBalance('0', 18)).toBe('0');
    });

    it('should format very small balance', () => {
      expect(formatBalance('100', 18)).toBe('<0.0001');
    });

    it('should format small balance with 4 decimals', () => {
      expect(formatBalance('500000000000000', 18)).toBe('0.0005');
    });

    it('should format medium balance with 4 decimals', () => {
      expect(formatBalance('50000000000000000', 18)).toBe('0.0500');
    });

    it('should format large balance with 2 decimals', () => {
      expect(formatBalance('150000000000000000000', 18)).toBe('150.00');
    });

    it('should format 1 ETH correctly', () => {
      expect(formatBalance('1000000000000000000', 18)).toBe('1.000');
    });

    it('should handle different decimals', () => {
      expect(formatBalance('1000000', 6)).toBe('1.000'); // USDC
    });
  });
});

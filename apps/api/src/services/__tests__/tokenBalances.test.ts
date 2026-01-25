import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env BEFORE any imports
vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    RPC_BASE: 'https://mainnet.base.org',
    RPC_ARBITRUM: 'https://arb1.arbitrum.io/rpc',
    RPC_BNB: 'https://bsc.llamarpc.com',
    RPC_AVALANCHE: 'https://avalanche.public-rpc.com',
    LOG_LEVEL: 'silent',
  },
  isTest: true,
  isDevelopment: false,
}));

// Mock viem
const mockGetBalance = vi.fn();
const mockReadContract = vi.fn();
const mockMulticall = vi.fn();

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getBalance: mockGetBalance,
      readContract: mockReadContract,
      multicall: mockMulticall,
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

import {
  scanTokenBalances,
  getNativeBalance,
  getTokenBalance,
  isBalanceStuck,
} from '../tokenBalances.js';
import { NATIVE_TOKEN_ADDRESS } from '@dustless/shared';
import { TEST_ADDRESS, TEST_CHAINS } from '../../test/helpers.js';

describe('tokenBalances service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNativeBalance()', () => {
    it('should return native balance as string', async () => {
      mockGetBalance.mockResolvedValue(1000000000000000000n); // 1 ETH

      const { createPublicClient, http } = await import('viem');
      const client = createPublicClient({ transport: http('test') });

      const balance = await getNativeBalance(client as any, TEST_ADDRESS);

      expect(balance).toBe('1000000000000000000');
      expect(mockGetBalance).toHaveBeenCalledWith({
        address: TEST_ADDRESS,
      });
    });

    it('should handle zero balance', async () => {
      mockGetBalance.mockResolvedValue(0n);

      const { createPublicClient, http } = await import('viem');
      const client = createPublicClient({ transport: http('test') });

      const balance = await getNativeBalance(client as any, TEST_ADDRESS);

      expect(balance).toBe('0');
    });

    it('should throw on RPC error', async () => {
      mockGetBalance.mockRejectedValue(new Error('RPC error'));

      const { createPublicClient, http } = await import('viem');
      const client = createPublicClient({ transport: http('test') });

      await expect(getNativeBalance(client as any, TEST_ADDRESS)).rejects.toThrow('RPC error');
    });
  });

  describe('getTokenBalance()', () => {
    const mockTokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base

    it('should return ERC-20 token balance', async () => {
      mockReadContract.mockResolvedValue(1000000n); // 1 USDC (6 decimals)

      const { createPublicClient, http } = await import('viem');
      const client = createPublicClient({ transport: http('test') });

      const balance = await getTokenBalance(client as any, mockTokenAddress, TEST_ADDRESS, TEST_CHAINS.BASE);

      expect(balance).toBe('1000000');
      expect(mockReadContract).toHaveBeenCalledWith({
        address: mockTokenAddress,
        abi: expect.any(Array),
        functionName: 'balanceOf',
        args: [TEST_ADDRESS],
      });
    });

    it('should handle zero token balance', async () => {
      mockReadContract.mockResolvedValue(0n);

      const { createPublicClient, http } = await import('viem');
      const client = createPublicClient({ transport: http('test') });

      const balance = await getTokenBalance(client as any, mockTokenAddress, TEST_ADDRESS, TEST_CHAINS.BASE);

      expect(balance).toBe('0');
    });

    it('should throw on contract read error', async () => {
      mockReadContract.mockRejectedValue(new Error('Contract error'));

      const { createPublicClient, http } = await import('viem');
      const client = createPublicClient({ transport: http('test') });

      await expect(
        getTokenBalance(client as any, mockTokenAddress, TEST_ADDRESS, TEST_CHAINS.BASE)
      ).rejects.toThrow('Contract error');
    });
  });

  describe('scanTokenBalances()', () => {
    it('should scan native ETH balance on Base', async () => {
      mockGetBalance.mockResolvedValue(1500000000000000000n); // 1.5 ETH
      mockMulticall.mockResolvedValue([]);

      const results = await scanTokenBalances(TEST_CHAINS.BASE, TEST_ADDRESS, []);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        chainId: TEST_CHAINS.BASE,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        symbol: 'ETH',
        name: 'Ether',
        decimals: 18,
        balance: '1500000000000000000',
        ok: true,
      });
    });

    it('should scan native BNB balance on BNB Chain', async () => {
      mockGetBalance.mockResolvedValue(2000000000000000000n); // 2 BNB
      mockMulticall.mockResolvedValue([]);

      const results = await scanTokenBalances(56, TEST_ADDRESS, []);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        chainId: 56,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        symbol: 'BNB',
        name: 'BNB',
        decimals: 18,
        balance: '2000000000000000000',
        ok: true,
      });
    });

    it('should scan native AVAX balance on Avalanche', async () => {
      mockGetBalance.mockResolvedValue(5000000000000000000n); // 5 AVAX
      mockMulticall.mockResolvedValue([]);

      const results = await scanTokenBalances(43114, TEST_ADDRESS, []);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        chainId: 43114,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        symbol: 'AVAX',
        name: 'Avalanche',
        decimals: 18,
        balance: '5000000000000000000',
        ok: true,
      });
    });

    it('should scan native and ERC-20 token balances', async () => {
      mockGetBalance.mockResolvedValue(1000000000000000000n); // 1 ETH
      mockMulticall.mockResolvedValue([
        { status: 'success', result: 1000000n }, // 1 USDC
        { status: 'success', result: 500000000000000000n }, // 0.5 DAI
      ]);

      const tokens = [
        {
          address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
          chainId: TEST_CHAINS.BASE,
        },
        {
          address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
          symbol: 'DAI',
          name: 'Dai Stablecoin',
          decimals: 18,
          chainId: TEST_CHAINS.BASE,
        },
      ];

      const results = await scanTokenBalances(TEST_CHAINS.BASE, TEST_ADDRESS, tokens);

      expect(results).toHaveLength(3); // 1 native + 2 ERC-20
      expect(results[0].symbol).toBe('ETH');
      expect(results[1].symbol).toBe('USDC');
      expect(results[1].balance).toBe('1000000');
      expect(results[2].symbol).toBe('DAI');
      expect(results[2].balance).toBe('500000000000000000');
    });

    it('should handle multicall failures gracefully', async () => {
      mockGetBalance.mockResolvedValue(1000000000000000000n);
      mockMulticall.mockResolvedValue([
        { status: 'success', result: 1000000n },
        { status: 'failure', error: new Error('Token not found') },
      ]);

      const tokens = [
        {
          address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
          chainId: TEST_CHAINS.BASE,
        },
        {
          address: '0xDeadBeefDeadBeefDeadBeefDeadBeefDeadBeef',
          symbol: 'FAKE',
          name: 'Fake Token',
          decimals: 18,
          chainId: TEST_CHAINS.BASE,
        },
      ];

      const results = await scanTokenBalances(TEST_CHAINS.BASE, TEST_ADDRESS, tokens);

      // Should have native + successful USDC, but not failed FAKE
      expect(results).toHaveLength(2);
      expect(results[0].symbol).toBe('ETH');
      expect(results[1].symbol).toBe('USDC');
    });

    it('should fallback to individual calls when multicall fails', async () => {
      mockGetBalance.mockResolvedValue(1000000000000000000n);
      mockMulticall.mockRejectedValue(new Error('Multicall not supported'));
      mockReadContract.mockResolvedValue(500000n);

      const tokens = [
        {
          address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
          chainId: TEST_CHAINS.BASE,
        },
      ];

      const results = await scanTokenBalances(TEST_CHAINS.BASE, TEST_ADDRESS, tokens);

      expect(results).toHaveLength(2);
      expect(results[1].symbol).toBe('USDC');
      expect(results[1].balance).toBe('500000');
    });

    it('should handle native balance error gracefully', async () => {
      mockGetBalance.mockRejectedValue(new Error('RPC error'));
      mockMulticall.mockResolvedValue([]);

      const results = await scanTokenBalances(TEST_CHAINS.BASE, TEST_ADDRESS, []);

      // Should return empty array when native balance fails
      expect(results).toHaveLength(0);
    });

    it('should return empty array on complete failure', async () => {
      mockGetBalance.mockRejectedValue(new Error('Connection error'));

      // Mock the createPublicClient to throw
      const viem = await import('viem');
      (viem.createPublicClient as any).mockImplementationOnce(() => {
        throw new Error('Connection refused');
      });

      const results = await scanTokenBalances(TEST_CHAINS.BASE, TEST_ADDRESS, []);

      expect(results).toEqual([]);
    });
  });

  describe('isBalanceStuck()', () => {
    it('should return false for zero balance', () => {
      expect(isBalanceStuck('0', 18)).toBe(false);
    });

    it('should return true for balance above $1 USD', () => {
      expect(isBalanceStuck('1000000000000000000', 18, 2000)).toBe(true); // 1 ETH at $2000
    });

    it('should return false for balance below $1 USD', () => {
      expect(isBalanceStuck('100000000000000', 18, 0.5)).toBe(false); // 0.0001 ETH at $0.50
    });

    it('should return true for balance above minimum threshold (no USD value)', () => {
      // 0.001 ETH = 1e15 wei, threshold is 1e15
      expect(isBalanceStuck('1000000000000000', 18)).toBe(true);
    });

    it('should return false for balance below minimum threshold (no USD value)', () => {
      // 0.0001 ETH = 1e14 wei, below threshold of 1e15
      expect(isBalanceStuck('100000000000000', 18)).toBe(false);
    });

    it('should handle 6 decimal tokens (USDC)', () => {
      // 1 USDC = 1e6, threshold for 6 decimals is 1000 (0.001)
      expect(isBalanceStuck('1000', 6)).toBe(true);
      expect(isBalanceStuck('999', 6)).toBe(false);
    });

    it('should handle 8 decimal tokens (WBTC)', () => {
      // Threshold for 8 decimals: 10^(8-3) = 100000
      expect(isBalanceStuck('100000', 8)).toBe(true);
      expect(isBalanceStuck('99999', 8)).toBe(false);
    });
  });
});

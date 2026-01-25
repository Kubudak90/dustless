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

// Mock viem
const mockEstimateGas = vi.fn();
const mockCall = vi.fn();
const mockGetBalance = vi.fn();

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      estimateGas: mockEstimateGas,
      call: mockCall,
      getBalance: mockGetBalance,
    })),
    http: vi.fn((url: string) => ({ url })),
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

import {
  simulateTransaction,
  simulateMultipleTransactions,
  checkBalance,
} from '../simulation.js';
import type { TxStep } from '@dustless/shared';
import { TEST_ADDRESS, TEST_CHAINS } from '../../test/helpers.js';

describe('simulation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks for successful simulation
    mockEstimateGas.mockResolvedValue(100000n);
    mockCall.mockResolvedValue('0x');
    mockGetBalance.mockResolvedValue(1000000000000000000n); // 1 ETH
  });

  describe('simulateTransaction()', () => {
    const mockTxStep: TxStep = {
      chainId: TEST_CHAINS.BASE,
      to: '0x1234567890123456789012345678901234567890',
      data: '0xabcdef',
      value: '1000000000000000000', // 1 ETH
      description: 'Test transaction',
    };

    it('should return success when transaction simulates correctly', async () => {
      mockEstimateGas.mockResolvedValue(150000n);
      mockCall.mockResolvedValue('0x');

      const result = await simulateTransaction(mockTxStep, TEST_ADDRESS);

      expect(result.success).toBe(true);
      expect(result.gasUsed).toBe('150000');
      expect(result.revertReason).toBeUndefined();
      expect(result.warnings).toEqual([]);
    });

    it('should add warning for high gas usage', async () => {
      mockEstimateGas.mockResolvedValue(600000n); // > 500k

      const result = await simulateTransaction(mockTxStep, TEST_ADDRESS);

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('High gas usage: 600000 units');
    });

    it('should return failure with revert reason for insufficient funds', async () => {
      mockEstimateGas.mockRejectedValue(new Error('insufficient funds for transfer'));

      const result = await simulateTransaction(mockTxStep, TEST_ADDRESS);

      expect(result.success).toBe(false);
      expect(result.gasUsed).toBe('0');
      expect(result.revertReason).toBe('Insufficient balance for transaction');
    });

    it('should handle exceeds allowance error', async () => {
      mockEstimateGas.mockRejectedValue(new Error('transfer amount exceeds allowance'));

      const result = await simulateTransaction(mockTxStep, TEST_ADDRESS);

      expect(result.success).toBe(false);
      expect(result.revertReason).toBe('Token approval required');
    });

    it('should handle token balance error', async () => {
      mockEstimateGas.mockRejectedValue(new Error('transfer amount exceeds balance'));

      const result = await simulateTransaction(mockTxStep, TEST_ADDRESS);

      expect(result.success).toBe(false);
      expect(result.revertReason).toBe('Insufficient token balance');
    });

    it('should handle slippage error', async () => {
      mockEstimateGas.mockRejectedValue(new Error('slippage tolerance exceeded'));

      const result = await simulateTransaction(mockTxStep, TEST_ADDRESS);

      expect(result.success).toBe(false);
      expect(result.revertReason).toBe('Price slippage too high');
    });

    it('should handle deadline error', async () => {
      mockEstimateGas.mockRejectedValue(new Error('transaction deadline passed'));

      const result = await simulateTransaction(mockTxStep, TEST_ADDRESS);

      expect(result.success).toBe(false);
      expect(result.revertReason).toBe('Transaction deadline expired');
    });

    it('should handle paused contract error', async () => {
      mockEstimateGas.mockRejectedValue(new Error('contract is paused'));

      const result = await simulateTransaction(mockTxStep, TEST_ADDRESS);

      expect(result.success).toBe(false);
      expect(result.revertReason).toBe('Contract is paused');
    });

    it('should extract revert reason from message', async () => {
      mockEstimateGas.mockRejectedValue(
        new Error("reverted with reason string 'Not enough tokens'")
      );

      const result = await simulateTransaction(mockTxStep, TEST_ADDRESS);

      expect(result.success).toBe(false);
      expect(result.revertReason).toBe('Not enough tokens');
    });

    it('should extract custom error from message', async () => {
      mockEstimateGas.mockRejectedValue(
        new Error("reverted with custom error 'InsufficientLiquidity()'")
      );

      const result = await simulateTransaction(mockTxStep, TEST_ADDRESS);

      expect(result.success).toBe(false);
      expect(result.revertReason).toBe("Contract error: InsufficientLiquidity()");
    });

    it('should handle unknown errors gracefully', async () => {
      mockEstimateGas.mockRejectedValue(new Error('Some unknown RPC error'));

      const result = await simulateTransaction(mockTxStep, TEST_ADDRESS);

      expect(result.success).toBe(false);
      expect(result.revertReason).toBe('Some unknown RPC error');
    });

    it('should handle non-Error throws', async () => {
      mockEstimateGas.mockRejectedValue('string error');

      const result = await simulateTransaction(mockTxStep, TEST_ADDRESS);

      expect(result.success).toBe(false);
      expect(result.revertReason).toBe('Transaction would fail');
    });
  });

  describe('simulateMultipleTransactions()', () => {
    const mockSteps: TxStep[] = [
      {
        chainId: TEST_CHAINS.BASE,
        to: '0x1111111111111111111111111111111111111111',
        data: '0xapprove',
        value: '0',
        description: 'Approve token',
      },
      {
        chainId: TEST_CHAINS.BASE,
        to: '0x2222222222222222222222222222222222222222',
        data: '0xswap',
        value: '1000000000000000000',
        description: 'Swap tokens',
      },
    ];

    it('should simulate all steps successfully', async () => {
      mockEstimateGas.mockResolvedValue(100000n);
      mockCall.mockResolvedValue('0x');

      const result = await simulateMultipleTransactions(mockSteps, TEST_ADDRESS);

      expect(result.success).toBe(true);
      expect(result.totalGasUsed).toBe('200000'); // 100k * 2
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults[0].success).toBe(true);
      expect(result.stepResults[1].success).toBe(true);
    });

    it('should include multi-step warning on success', async () => {
      mockEstimateGas.mockResolvedValue(100000n);
      mockCall.mockResolvedValue('0x');

      const result = await simulateMultipleTransactions(mockSteps, TEST_ADDRESS);

      expect(result.warnings).toContain(
        'Multi-step transaction: Simulation runs each step independently. ' +
        'Actual execution may differ if blockchain state changes between steps.'
      );
    });

    it('should stop on first failure and report it', async () => {
      mockEstimateGas
        .mockResolvedValueOnce(50000n) // First step succeeds
        .mockRejectedValueOnce(new Error('insufficient funds')); // Second step fails

      const result = await simulateMultipleTransactions(mockSteps, TEST_ADDRESS);

      expect(result.success).toBe(false);
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults[0].success).toBe(true);
      expect(result.stepResults[0].gasUsed).toBe('50000');
      expect(result.stepResults[1].success).toBe(false);
      expect(result.stepResults[1].revertReason).toBe('Insufficient balance for transaction');
      expect(result.warnings).toContain('Step 2 failed: Insufficient balance for transaction');
    });

    it('should accumulate gas from successful steps', async () => {
      mockEstimateGas
        .mockResolvedValueOnce(75000n)
        .mockResolvedValueOnce(125000n);
      mockCall.mockResolvedValue('0x');

      const result = await simulateMultipleTransactions(mockSteps, TEST_ADDRESS);

      expect(result.success).toBe(true);
      expect(result.totalGasUsed).toBe('200000'); // 75k + 125k
    });

    it('should propagate step-level warnings', async () => {
      mockEstimateGas.mockResolvedValue(600000n); // High gas
      mockCall.mockResolvedValue('0x');

      const result = await simulateMultipleTransactions(mockSteps, TEST_ADDRESS);

      expect(result.warnings).toContain('Step 1: High gas usage: 600000 units');
      expect(result.warnings).toContain('Step 2: High gas usage: 600000 units');
    });

    it('should handle single step correctly', async () => {
      mockEstimateGas.mockResolvedValue(100000n);
      mockCall.mockResolvedValue('0x');

      const result = await simulateMultipleTransactions([mockSteps[0]], TEST_ADDRESS);

      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(1);
      // Should not include multi-step warning for single step
      expect(result.warnings).not.toContain(
        expect.stringContaining('Multi-step transaction')
      );
    });

    it('should handle empty steps array', async () => {
      const result = await simulateMultipleTransactions([], TEST_ADDRESS);

      expect(result.success).toBe(true);
      expect(result.totalGasUsed).toBe('0');
      expect(result.stepResults).toEqual([]);
    });
  });

  describe('checkBalance()', () => {
    it('should return sufficient when balance exceeds required', async () => {
      mockGetBalance.mockResolvedValue(2000000000000000000n); // 2 ETH

      const result = await checkBalance(
        TEST_CHAINS.BASE,
        TEST_ADDRESS,
        '1000000000000000000' // 1 ETH required
      );

      expect(result.sufficient).toBe(true);
      expect(result.balance).toBe('2000000000000000000');
    });

    it('should return sufficient when balance equals required', async () => {
      mockGetBalance.mockResolvedValue(1000000000000000000n); // 1 ETH

      const result = await checkBalance(
        TEST_CHAINS.BASE,
        TEST_ADDRESS,
        '1000000000000000000' // 1 ETH required
      );

      expect(result.sufficient).toBe(true);
      expect(result.balance).toBe('1000000000000000000');
    });

    it('should return insufficient when balance is less than required', async () => {
      mockGetBalance.mockResolvedValue(500000000000000000n); // 0.5 ETH

      const result = await checkBalance(
        TEST_CHAINS.BASE,
        TEST_ADDRESS,
        '1000000000000000000' // 1 ETH required
      );

      expect(result.sufficient).toBe(false);
      expect(result.balance).toBe('500000000000000000');
    });

    it('should return insufficient on RPC error', async () => {
      mockGetBalance.mockRejectedValue(new Error('RPC error'));

      const result = await checkBalance(
        TEST_CHAINS.BASE,
        TEST_ADDRESS,
        '1000000000000000000'
      );

      expect(result.sufficient).toBe(false);
      expect(result.balance).toBe('0');
    });
  });
});

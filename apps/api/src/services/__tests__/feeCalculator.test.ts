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

// Mock price oracle
vi.mock('../priceOracle.js', () => ({
  priceOracle: {
    getETHPrice: vi.fn().mockResolvedValue(2000),
  },
}));

import {
  calculateRecoveryFee,
  isRecoveryWorthwhile,
  formatFeePercentage,
  getFeeTierDescription,
} from '../feeCalculator.js';

describe('feeCalculator service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateRecoveryFee()', () => {
    it('should calculate 0.5% fee for small amounts (under $100)', async () => {
      // 0.025 ETH = $50 at $2000/ETH, minus $10 gas = $40 net
      const result = await calculateRecoveryFee(
        '25000000000000000', // 0.025 ETH
        10 // $10 gas cost
      );

      expect(result.feePercentage).toBe(0.5); // 0.5%
      expect(result.netRecoveredUsd).toBe(40); // $50 - $10 = $40
      expect(result.feeUsd).toBe(0.2); // $40 * 0.5% = $0.20
      expect(result.finalAmountUsd).toBeCloseTo(39.8, 1); // $40 - $0.20
    });

    it('should calculate 1% fee for large amounts (over $100)', async () => {
      // 0.1 ETH = $200 at $2000/ETH, minus $20 gas = $180 net
      const result = await calculateRecoveryFee(
        '100000000000000000', // 0.1 ETH
        20 // $20 gas cost
      );

      expect(result.feePercentage).toBe(1); // 1%
      expect(result.netRecoveredUsd).toBe(180); // $200 - $20 = $180
      expect(result.feeUsd).toBe(1.8); // $180 * 1% = $1.80
      expect(result.finalAmountUsd).toBeCloseTo(178.2, 1);
    });

    it('should use provided grossAmountUsd when available', async () => {
      const result = await calculateRecoveryFee(
        '50000000000000000', // 0.05 ETH (ignored for USD calculation)
        5, // $5 gas cost
        80 // $80 gross (provided)
      );

      expect(result.netRecoveredUsd).toBe(75); // $80 - $5 = $75
      expect(result.feePercentage).toBe(0.5); // Under $100
    });

    it('should return shouldBatch=true for small net amounts (under $10)', async () => {
      // 0.005 ETH = $10 at $2000/ETH, minus $5 gas = $5 net
      const result = await calculateRecoveryFee(
        '5000000000000000', // 0.005 ETH
        5 // $5 gas cost
      );

      expect(result.shouldBatch).toBe(true);
      expect(result.netRecoveredUsd).toBe(5);
    });

    it('should return shouldBatch=false for larger amounts', async () => {
      // 0.01 ETH = $20 at $2000/ETH, minus $5 gas = $15 net
      const result = await calculateRecoveryFee(
        '10000000000000000', // 0.01 ETH
        5 // $5 gas cost
      );

      expect(result.shouldBatch).toBe(false);
      expect(result.netRecoveredUsd).toBe(15);
    });

    it('should handle zero net recovery when costs exceed gross', async () => {
      // 0.005 ETH = $10 at $2000/ETH, minus $15 gas = negative (clamped to 0)
      const result = await calculateRecoveryFee(
        '5000000000000000', // 0.005 ETH
        15 // $15 gas cost (exceeds gross)
      );

      expect(result.netRecoveredUsd).toBe(0);
      expect(result.feeUsd).toBe(0);
      expect(result.finalAmountUsd).toBe(0);
      expect(result.finalAmountWei).toBe('0');
    });

    it('should include breakdown details', async () => {
      const result = await calculateRecoveryFee(
        '50000000000000000', // 0.05 ETH = $100
        10 // $10 gas cost
      );

      expect(result.breakdown).toMatchObject({
        grossAmountWei: '50000000000000000',
        grossAmountUsd: 100,
        gasAndBridgeCostUsd: 10,
        netRecoveredUsd: 90,
      });
    });

    it('should correctly calculate wei amounts proportionally', async () => {
      const result = await calculateRecoveryFee(
        '100000000000000000', // 0.1 ETH
        0, // No gas cost
        200 // $200 gross
      );

      // Net = $200, Fee = 1% = $2, Final = $198
      expect(result.netRecoveredUsd).toBe(200);
      expect(result.feePercentage).toBe(1);

      // Wei values should be proportional
      const netWei = BigInt(result.netRecoveredWei);
      const feeWei = BigInt(result.feeWei);
      const finalWei = BigInt(result.finalAmountWei);

      expect(netWei).toBe(100000000000000000n); // Full amount (no costs)
      expect(finalWei + feeWei).toBe(netWei);
    });

    it('should handle edge case at $100 boundary', async () => {
      // Exactly $100 net should use 0.5% (under threshold)
      const result = await calculateRecoveryFee(
        '55000000000000000', // 0.055 ETH = $110
        10 // $10 gas = $100 net
      );

      // $100 is exactly at threshold, so uses tier 1 (under $100)
      // Actually the check is "< 100", so exactly $100 uses tier 2
      expect(result.netRecoveredUsd).toBe(100);
      expect(result.feePercentage).toBe(1); // >= $100 uses 1%
    });

    it('should handle very small amounts correctly', async () => {
      // 0.00005 ETH = $0.10 at $2000/ETH
      const result = await calculateRecoveryFee(
        '50000000000000', // 0.00005 ETH
        0.05 // $0.05 gas cost
      );

      expect(result.netRecoveredUsd).toBe(0.05);
      expect(result.feePercentage).toBe(0.5);
      expect(result.feeUsd).toBeCloseTo(0.00025, 5);
    });
  });

  describe('isRecoveryWorthwhile()', () => {
    it('should return true when final amount is positive', () => {
      const calculation = {
        netRecoveredWei: '100000000000000000',
        netRecoveredUsd: 100,
        feeWei: '1000000000000000',
        feeUsd: 1,
        feePercentage: 1,
        finalAmountWei: '99000000000000000',
        finalAmountUsd: 99,
        shouldBatch: false,
        breakdown: {
          grossAmountWei: '100000000000000000',
          grossAmountUsd: 100,
          gasAndBridgeCostUsd: 0,
          netRecoveredUsd: 100,
          feeUsd: 1,
          finalAmountUsd: 99,
        },
      };

      expect(isRecoveryWorthwhile(calculation)).toBe(true);
    });

    it('should return false when final amount is zero', () => {
      const calculation = {
        netRecoveredWei: '0',
        netRecoveredUsd: 0,
        feeWei: '0',
        feeUsd: 0,
        feePercentage: 0.5,
        finalAmountWei: '0',
        finalAmountUsd: 0,
        shouldBatch: false,
        breakdown: {
          grossAmountWei: '1000000000000000',
          grossAmountUsd: 2,
          gasAndBridgeCostUsd: 5,
          netRecoveredUsd: 0,
          feeUsd: 0,
          finalAmountUsd: 0,
        },
      };

      expect(isRecoveryWorthwhile(calculation)).toBe(false);
    });

    it('should return false when final amount is negative (clamped to 0)', () => {
      const calculation = {
        netRecoveredWei: '0',
        netRecoveredUsd: 0,
        feeWei: '0',
        feeUsd: 0,
        feePercentage: 0.5,
        finalAmountWei: '0',
        finalAmountUsd: 0,
        shouldBatch: false,
        breakdown: {
          grossAmountWei: '1000000000000000',
          grossAmountUsd: 2,
          gasAndBridgeCostUsd: 10, // Costs exceed gross
          netRecoveredUsd: 0,
          feeUsd: 0,
          finalAmountUsd: 0,
        },
      };

      expect(isRecoveryWorthwhile(calculation)).toBe(false);
    });
  });

  describe('formatFeePercentage()', () => {
    it('should format percentage under 1% with one decimal', () => {
      expect(formatFeePercentage(0.5)).toBe('0.5%');
      expect(formatFeePercentage(0.25)).toBe('0.3%'); // Rounds up
    });

    it('should format percentage 1% and above with no decimal', () => {
      expect(formatFeePercentage(1)).toBe('1%');
      expect(formatFeePercentage(1.5)).toBe('2%'); // Rounds
      expect(formatFeePercentage(2.49)).toBe('2%');
    });
  });

  describe('getFeeTierDescription()', () => {
    it('should return tier 1 description for small amounts', () => {
      expect(getFeeTierDescription(50)).toBe('0.5% fee (under $100)');
      expect(getFeeTierDescription(99.99)).toBe('0.5% fee (under $100)');
    });

    it('should return tier 2 description for large amounts', () => {
      expect(getFeeTierDescription(100)).toBe('1% fee (over $100)');
      expect(getFeeTierDescription(500)).toBe('1% fee (over $100)');
    });
  });
});

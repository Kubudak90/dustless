import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { scanHandler, quoteHandler, buildHandler } from '../handlers/index.js';

/**
 * Create a test Fastify app instance
 */
export async function createTestApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // Disable logging in tests
  });

  // Register CORS
  await app.register(cors, {
    origin: ['http://localhost:3000'],
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  });

  // Register routes
  app.post('/scan', scanHandler);
  app.post('/quote', quoteHandler);
  app.post('/build', buildHandler);

  // Error handler
  app.setErrorHandler((error, _request, reply) => {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        error: 'Validation error',
        details: (error as any).issues,
      });
    }

    return reply.status(error.statusCode ?? 500).send({
      error: error.message ?? 'Internal server error',
    });
  });

  return app;
}

/**
 * Valid test Ethereum address (checksummed, Vitalik's address)
 */
export const TEST_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

/**
 * Another valid test address (Vitalik's address)
 */
export const VITALIK_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

/**
 * Invalid Ethereum address for testing validation
 */
export const INVALID_ADDRESS = '0xinvalid';

/**
 * Common chain IDs for testing
 */
export const TEST_CHAINS = {
  BASE: 8453,
  ARBITRUM: 42161,
  BLAST: 81457,
  MODE: 34443,
  ZORA: 7777777,
};

/**
 * Mock HTTP responses for testing
 */
export const mockLiFiQuoteResponse = {
  id: 'test-route-id',
  type: 'lifi',
  tool: 'stargate',
  toolDetails: {
    key: 'stargate',
    name: 'Stargate',
    logoURI: 'https://example.com/logo.png',
  },
  estimate: {
    toAmount: '990000000000000000', // 0.99 ETH after fees
    toAmountMin: '980000000000000000',
    toAmountUSD: '1980.00',
    executionDuration: 120,
    feeCosts: [
      {
        name: 'Bridge Fee',
        amount: '5000000000000000',
        amountUSD: '10.00',
      },
      {
        name: 'Gas Fee',
        amount: '5000000000000000',
        amountUSD: '10.00',
      },
    ],
  },
  includedSteps: [
    {
      id: 'step-1',
      type: 'cross',
      tool: 'stargate',
      toolDetails: { name: 'Stargate' },
      action: {
        fromChainId: TEST_CHAINS.BLAST,
        toChainId: TEST_CHAINS.BASE,
      },
      estimate: {
        executionDuration: 120,
        feeCosts: [{ amountUSD: '20.00' }],
      },
    },
  ],
  transactionRequest: {
    to: '0x1234567890123456789012345678901234567890',
    data: '0xabcdef',
    value: '1000000000000000000',
    gasLimit: '200000',
    gasPrice: '1000000000',
  },
};

export const mockSocketQuoteResponse = {
  success: true,
  result: {
    routes: [
      {
        routeId: 'socket-route-1',
        toAmount: '995000000000000000',
        outputValueInUsd: '1990.00',
        totalBridgeFeeUSD: '8.00',
        totalGasFeesInUsd: '12.00',
        serviceTime: 180,
        usedBridgeNames: ['Across'],
        userTxs: [
          {
            chainId: TEST_CHAINS.BLAST,
            toChainId: TEST_CHAINS.BASE,
            protocol: 'Across',
            serviceTime: 180,
          },
        ],
      },
      {
        routeId: 'socket-route-2',
        toAmount: '992000000000000000',
        outputValueInUsd: '1984.00',
        totalBridgeFeeUSD: '10.00',
        totalGasFeesInUsd: '10.00',
        serviceTime: 150,
        usedBridgeNames: ['Hop'],
        userTxs: [
          {
            chainId: TEST_CHAINS.BLAST,
            toChainId: TEST_CHAINS.BASE,
            protocol: 'Hop',
            serviceTime: 150,
          },
        ],
      },
    ],
  },
};

export const mockSocketBuildResponse = {
  success: true,
  result: {
    txTarget: '0x1234567890123456789012345678901234567890',
    txData: '0xabcdef123456',
    value: '1000000000000000000',
    chainId: TEST_CHAINS.BLAST,
  },
};

/**
 * Mock balance response for testing
 */
export const mockBalanceResponse = {
  chainId: TEST_CHAINS.BASE,
  tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  symbol: 'ETH',
  name: 'Ethereum',
  decimals: 18,
  balance: '1500000000000000000', // 1.5 ETH
  ok: true,
};

/**
 * Mock stuck asset for testing
 */
export const mockStuckAsset = {
  chainId: TEST_CHAINS.BLAST,
  chainName: 'Blast',
  tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  symbol: 'ETH',
  name: 'Ethereum',
  decimals: 18,
  balance: '1000000000000000000',
  bridgeableAmount: '995000000000000000',
  requiredGasWei: '5000000000000000',
  expectedRemainingUsd: 0.01,
  usdValue: 2000,
};

/**
 * Mock price data for testing
 */
export const mockPriceData = {
  ethereum: {
    usd: 2000,
    usd_24h_change: 2.5,
  },
};

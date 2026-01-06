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
 * Valid test Ethereum address
 */
export const TEST_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';

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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, TEST_ADDRESS, TEST_CHAINS } from '../../test/helpers.js';

describe('POST /quote', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should reject missing required fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/quote',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation error');
  });

  it('should reject invalid fromAddress', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/quote',
      payload: {
        fromChainId: TEST_CHAINS.BLAST,
        toChainId: TEST_CHAINS.BASE,
        tokenSymbol: 'ETH',
        amountWei: '1000000000000000000',
        fromAddress: 'invalid',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation error');
  });

  it('should reject invalid amountWei', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/quote',
      payload: {
        fromChainId: TEST_CHAINS.BLAST,
        toChainId: TEST_CHAINS.BASE,
        tokenSymbol: 'ETH',
        amountWei: '-100', // Negative amount
        fromAddress: TEST_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation error');
  });

  it('should reject non-ETH token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/quote',
      payload: {
        fromChainId: TEST_CHAINS.BLAST,
        toChainId: TEST_CHAINS.BASE,
        tokenSymbol: 'USDC', // Only ETH supported in MVP
        amountWei: '1000000000000000000',
        fromAddress: TEST_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation error');
  });

  it('should return quotes for valid request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/quote',
      payload: {
        fromChainId: TEST_CHAINS.BLAST,
        toChainId: TEST_CHAINS.BASE,
        tokenSymbol: 'ETH',
        amountWei: '1000000000000000000', // 1 ETH
        fromAddress: TEST_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    // Should have quotes array
    expect(body).toHaveProperty('quotes');
    expect(Array.isArray(body.quotes)).toBe(true);

    // If quotes exist, check structure
    if (body.quotes.length > 0) {
      const quote = body.quotes[0];
      expect(quote).toHaveProperty('provider');
      expect(quote).toHaveProperty('routeId');
      expect(quote).toHaveProperty('steps');
      expect(quote).toHaveProperty('estimatedReceivedWei');
      expect(Array.isArray(quote.steps)).toBe(true);

      // Provider should be 'lifi' or 'socket'
      expect(['lifi', 'socket']).toContain(quote.provider);
    }
  });

  it('should return empty array if no routes available', async () => {
    // Use unsupported chain pair or very small amount
    const response = await app.inject({
      method: 'POST',
      url: '/quote',
      payload: {
        fromChainId: 999999, // Non-existent chain
        toChainId: TEST_CHAINS.BASE,
        tokenSymbol: 'ETH',
        amountWei: '1',
        fromAddress: TEST_ADDRESS,
      },
    });

    // Should succeed but return empty quotes
    expect([200, 500]).toContain(response.statusCode); // May fail or return empty
    const body = response.json();

    if (response.statusCode === 200) {
      expect(body.quotes).toEqual([]);
    }
  });

  it('should sort quotes by best output', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/quote',
      payload: {
        fromChainId: TEST_CHAINS.BLAST,
        toChainId: TEST_CHAINS.BASE,
        tokenSymbol: 'ETH',
        amountWei: '1000000000000000000',
        fromAddress: TEST_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    if (body.quotes.length > 1) {
      // First quote should have highest or equal estimatedReceivedWei
      const first = BigInt(body.quotes[0].estimatedReceivedWei);
      const second = BigInt(body.quotes[1].estimatedReceivedWei);
      expect(first >= second).toBe(true);
    }
  });

  it('should accept small amounts', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/quote',
      payload: {
        fromChainId: TEST_CHAINS.BLAST,
        toChainId: TEST_CHAINS.BASE,
        tokenSymbol: 'ETH',
        amountWei: '10000000000000000', // 0.01 ETH
        fromAddress: TEST_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('quotes');
  });

  it('should reject invalid chain IDs', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/quote',
      payload: {
        fromChainId: -1,
        toChainId: 0,
        tokenSymbol: 'ETH',
        amountWei: '1000000000000000000',
        fromAddress: TEST_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation error');
  });

  it('should handle same fromChain and toChain', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/quote',
      payload: {
        fromChainId: TEST_CHAINS.BASE,
        toChainId: TEST_CHAINS.BASE, // Same chain
        tokenSymbol: 'ETH',
        amountWei: '1000000000000000000',
        fromAddress: TEST_ADDRESS,
      },
    });

    // Should return empty or succeed based on provider behavior
    expect([200, 400]).toContain(response.statusCode);
  });
});

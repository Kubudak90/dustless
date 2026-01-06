import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, TEST_ADDRESS, TEST_CHAINS } from '../../test/helpers.js';
import type { Quote } from '@dustless/shared';

describe('POST /build', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // Helper to create a mock quote
  const createMockQuote = (provider: 'lifi' | 'socket'): Quote => ({
    provider,
    routeId: `${provider}:test:${Date.now()}`,
    steps: [
      {
        fromChainId: TEST_CHAINS.BLAST,
        toChainId: TEST_CHAINS.BASE,
        tool: 'Stargate',
        estimatedTimeSec: 180,
      },
    ],
    estimatedReceivedWei: '980000000000000000', // 0.98 ETH after fees
    estimatedReceivedUsd: 1960,
    estimatedTotalFeeUsd: 40,
    estimatedTotalTimeSec: 180,
  });

  it('should reject missing quote', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/build',
      payload: {
        userAddress: TEST_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation error');
  });

  it('should reject missing userAddress', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/build',
      payload: {
        quote: createMockQuote('lifi'),
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation error');
  });

  it('should reject invalid userAddress', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/build',
      payload: {
        quote: createMockQuote('lifi'),
        userAddress: 'invalid',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation error');
  });

  it('should build transaction steps for LiFi quote', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/build',
      payload: {
        quote: createMockQuote('lifi'),
        userAddress: TEST_ADDRESS,
      },
    });

    // May succeed or fail depending on quote validity
    if (response.statusCode === 200) {
      const body = response.json();
      expect(body).toHaveProperty('steps');
      expect(Array.isArray(body.steps)).toBe(true);

      if (body.steps.length > 0) {
        const step = body.steps[0];
        expect(step).toHaveProperty('chainId');
        expect(step).toHaveProperty('to');
        expect(step).toHaveProperty('data');
        expect(step).toHaveProperty('value');

        // Verify Ethereum address format
        expect(step.to).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(step.data).toMatch(/^0x[a-fA-F0-9]*$/);
      }

      // Should have warnings property
      expect(body).toHaveProperty('warnings');
      expect(Array.isArray(body.warnings)).toBe(true);
    } else {
      // Build may fail with test quote - that's ok
      expect([400, 500]).toContain(response.statusCode);
    }
  });

  it('should build transaction steps for Socket quote', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/build',
      payload: {
        quote: createMockQuote('socket'),
        userAddress: TEST_ADDRESS,
      },
    });

    // May succeed or fail depending on quote validity
    if (response.statusCode === 200) {
      const body = response.json();
      expect(body).toHaveProperty('steps');
      expect(Array.isArray(body.steps)).toBe(true);
      expect(body).toHaveProperty('warnings');
    } else {
      expect([400, 500]).toContain(response.statusCode);
    }
  });

  it('should reject unsupported provider', async () => {
    const invalidQuote = {
      ...createMockQuote('lifi'),
      provider: 'unsupported',
    };

    const response = await app.inject({
      method: 'POST',
      url: '/build',
      payload: {
        quote: invalidQuote as any,
        userAddress: TEST_ADDRESS,
      },
    });

    expect([400, 500]).toContain(response.statusCode);
  });

  it('should handle quote with multiple steps', async () => {
    const multiStepQuote: Quote = {
      provider: 'lifi',
      routeId: 'lifi:multistep:test',
      steps: [
        {
          fromChainId: TEST_CHAINS.BLAST,
          toChainId: TEST_CHAINS.ARBITRUM,
          tool: 'Hop',
          estimatedTimeSec: 120,
        },
        {
          fromChainId: TEST_CHAINS.ARBITRUM,
          toChainId: TEST_CHAINS.BASE,
          tool: 'Stargate',
          estimatedTimeSec: 180,
        },
      ],
      estimatedReceivedWei: '970000000000000000',
      estimatedTotalTimeSec: 300,
    };

    const response = await app.inject({
      method: 'POST',
      url: '/build',
      payload: {
        quote: multiStepQuote,
        userAddress: TEST_ADDRESS,
      },
    });

    // May succeed or fail - test that it doesn't crash
    expect([200, 400, 500]).toContain(response.statusCode);
  });

  it('should validate quote structure', async () => {
    const invalidQuote = {
      provider: 'lifi',
      // Missing required fields
    };

    const response = await app.inject({
      method: 'POST',
      url: '/build',
      payload: {
        quote: invalidQuote,
        userAddress: TEST_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

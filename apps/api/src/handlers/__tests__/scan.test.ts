import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, TEST_ADDRESS, INVALID_ADDRESS, TEST_CHAINS } from '../../test/helpers.js';

describe('POST /scan', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should reject invalid Ethereum address', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/scan',
      payload: {
        address: INVALID_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation error');
  });

  it('should reject missing address', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/scan',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation error');
  });

  it('should scan balances for valid address', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/scan',
      payload: {
        address: TEST_ADDRESS,
        chainIds: [TEST_CHAINS.BASE, TEST_CHAINS.ARBITRUM],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    // Check response structure
    expect(body).toHaveProperty('balances');
    expect(body).toHaveProperty('stuck');
    expect(body).toHaveProperty('totalStuckUsd');

    // Balances should be an array
    expect(Array.isArray(body.balances)).toBe(true);

    // Each balance should have required fields
    if (body.balances.length > 0) {
      const balance = body.balances[0];
      expect(balance).toHaveProperty('chainId');
      expect(balance).toHaveProperty('tokenAddress');
      expect(balance).toHaveProperty('symbol');
      expect(balance).toHaveProperty('name');
      expect(balance).toHaveProperty('decimals');
      expect(balance).toHaveProperty('balance');
      expect(balance).toHaveProperty('ok');
    }
  });

  it('should use default chains if chainIds not provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/scan',
      payload: {
        address: TEST_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('balances');
    expect(Array.isArray(body.balances)).toBe(true);
  });

  it('should identify stuck assets correctly', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/scan',
      payload: {
        address: TEST_ADDRESS,
        chainIds: [TEST_CHAINS.BLAST, TEST_CHAINS.MODE],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    // Stuck assets should be an array
    expect(Array.isArray(body.stuck)).toBe(true);

    // Each stuck asset should have required fields
    if (body.stuck.length > 0) {
      const stuckAsset = body.stuck[0];
      expect(stuckAsset).toHaveProperty('chainId');
      expect(stuckAsset).toHaveProperty('wei');
      expect(stuckAsset).toHaveProperty('eth');
      expect(stuckAsset).toHaveProperty('isStuck');
      expect(stuckAsset.isStuck).toBe(true);
    }
  });

  it('should handle scan with single chain', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/scan',
      payload: {
        address: TEST_ADDRESS,
        chainIds: [TEST_CHAINS.BASE],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.balances).toHaveLength(1);
    expect(body.balances[0].chainId).toBe(TEST_CHAINS.BASE);
  });

  it('should reject invalid chainIds', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/scan',
      payload: {
        address: TEST_ADDRESS,
        chainIds: [-1, 0], // Invalid chain IDs
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation error');
  });

  it('should reject empty chainIds array', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/scan',
      payload: {
        address: TEST_ADDRESS,
        chainIds: [],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation error');
  });
});

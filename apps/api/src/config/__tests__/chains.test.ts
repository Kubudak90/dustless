import { describe, it, expect, vi } from 'vitest';
import { getChainConfig, getAllConfiguredChains } from '../chains.js';
import { TEST_CHAINS } from '../../test/helpers.js';

// Mock env module
vi.mock('../env.js', () => ({
  env: {
    RPC_BASE: 'https://custom-base-rpc.example.com',
    RPC_ARBITRUM: 'https://custom-arbitrum-rpc.example.com',
    RPC_BLAST: undefined, // Not configured
    LOG_LEVEL: 'silent',
  },
  isTest: true,
  isDevelopment: false,
}));

describe('chains config', () => {
  describe('getChainConfig()', () => {
    it('should return chain config for Base', () => {
      const config = getChainConfig(TEST_CHAINS.BASE);

      expect(config).toMatchObject({
        id: TEST_CHAINS.BASE,
        name: 'Base',
      });
      expect(config.rpcUrls).toBeDefined();
      expect(Array.isArray(config.rpcUrls)).toBe(true);
    });

    it('should return chain config for Arbitrum', () => {
      const config = getChainConfig(TEST_CHAINS.ARBITRUM);

      expect(config).toMatchObject({
        id: TEST_CHAINS.ARBITRUM,
        name: 'Arbitrum One',
      });
    });

    it('should return chain config for Blast', () => {
      const config = getChainConfig(TEST_CHAINS.BLAST);

      expect(config).toMatchObject({
        id: TEST_CHAINS.BLAST,
        name: 'Blast',
      });
    });

    it('should return chain config for Mode', () => {
      const config = getChainConfig(TEST_CHAINS.MODE);

      expect(config).toMatchObject({
        id: TEST_CHAINS.MODE,
        name: 'Mode',
      });
    });

    it('should return chain config for Zora', () => {
      const config = getChainConfig(TEST_CHAINS.ZORA);

      expect(config).toMatchObject({
        id: TEST_CHAINS.ZORA,
        name: 'Zora',
      });
    });

    it('should throw error for unknown chain ID', () => {
      expect(() => getChainConfig(999999)).toThrow('Unknown chainId: 999999');
    });

    it('should throw error for negative chain ID', () => {
      expect(() => getChainConfig(-1)).toThrow();
    });

    it('should throw error for zero chain ID', () => {
      expect(() => getChainConfig(0)).toThrow();
    });

    it('should override RPC URLs with env variables', () => {
      const config = getChainConfig(TEST_CHAINS.BASE);

      // Should have custom RPC as first entry
      expect(config.rpcUrls[0]).toBe('https://custom-base-rpc.example.com');
    });

    it('should use default RPC when env not configured', () => {
      const config = getChainConfig(TEST_CHAINS.BLAST);

      // Should use default RPC URLs (env.RPC_BLAST is undefined)
      expect(config.rpcUrls.length).toBeGreaterThan(0);
      expect(config.rpcUrls[0]).not.toContain('custom');
    });

    it('should include chain metadata', () => {
      const config = getChainConfig(TEST_CHAINS.BASE);

      expect(config).toHaveProperty('id');
      expect(config).toHaveProperty('name');
      expect(config).toHaveProperty('rpcUrls');
      // Check that config has expected structure (ChainConfig type)
      expect(typeof config.id).toBe('number');
      expect(typeof config.name).toBe('string');
      expect(Array.isArray(config.rpcUrls)).toBe(true);
    });

    it('should include tags', () => {
      const config = getChainConfig(TEST_CHAINS.BASE);

      expect(config).toHaveProperty('tags');
      expect(Array.isArray(config.tags)).toBe(true);
    });
  });

  describe('getAllConfiguredChains()', () => {
    it('should return array of all chains', () => {
      const chains = getAllConfiguredChains();

      expect(Array.isArray(chains)).toBe(true);
      expect(chains.length).toBeGreaterThan(0);
    });

    it('should include known chains', () => {
      const chains = getAllConfiguredChains();
      const chainIds = chains.map((c) => c.id);

      expect(chainIds).toContain(TEST_CHAINS.BASE);
      expect(chainIds).toContain(TEST_CHAINS.ARBITRUM);
      expect(chainIds).toContain(TEST_CHAINS.BLAST);
    });

    it('should return valid chain configs', () => {
      const chains = getAllConfiguredChains();

      chains.forEach((chain) => {
        expect(chain).toHaveProperty('id');
        expect(chain).toHaveProperty('name');
        expect(chain).toHaveProperty('rpcUrls');
        expect(chain.rpcUrls.length).toBeGreaterThan(0);
      });
    });

    it('should apply env overrides to all chains', () => {
      const chains = getAllConfiguredChains();
      const baseChain = chains.find((c) => c.id === TEST_CHAINS.BASE);

      expect(baseChain).toBeDefined();
      expect(baseChain!.rpcUrls[0]).toBe('https://custom-base-rpc.example.com');
    });

    it('should not have duplicate chain IDs', () => {
      const chains = getAllConfiguredChains();
      const chainIds = chains.map((c) => c.id);
      const uniqueIds = new Set(chainIds);

      expect(chainIds.length).toBe(uniqueIds.size);
    });

    it('should include both target and non-target chains', () => {
      const chains = getAllConfiguredChains();
      const hasTarget = chains.some((c) => c.tags.includes('target'));
      const hasNonTarget = chains.some((c) => !c.tags.includes('target'));

      expect(hasTarget).toBe(true);
      expect(hasNonTarget).toBe(true);
    });
  });
});

import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { loggers } from '../config/logger.js';

const log = loggers.cache;

/**
 * Cache Service using Redis
 * Provides caching layer for quotes, prices, and balance data
 */
export class CacheService {
  private redis: Redis | null = null;
  private enabled: boolean = false;

  constructor() {
    if (env.REDIS_URL) {
      try {
        const redis = new Redis(env.REDIS_URL, {
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          lazyConnect: true,
        });

        this.redis = redis;

        redis.on('error', (error: Error) => {
          log.error({ err: error }, 'Redis error');
          this.enabled = false;
        });

        redis.on('connect', () => {
          log.info('Redis connected');
          this.enabled = true;
        });

        redis.on('ready', () => {
          this.enabled = true;
        });

        // Connect in background
        redis.connect().catch((error: Error) => {
          log.warn({ err: error }, 'Redis connection failed');
          this.enabled = false;
        });
      } catch (error) {
        log.warn({ err: error }, 'Failed to initialize Redis');
        this.enabled = false;
      }
    } else {
      log.warn('Redis not configured (REDIS_URL missing). Caching disabled.');
    }
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled || !this.redis) {
      return null;
    }

    try {
      const value = await this.redis.get(key);
      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      log.error({ err: error, key }, 'Cache get error');
      return null;
    }
  }

  /**
   * Set cached value with TTL in seconds
   */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.enabled || !this.redis) {
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.redis.setex(key, ttlSeconds, serialized);
    } catch (error) {
      log.error({ err: error, key }, 'Cache set error');
    }
  }

  /**
   * Delete cached value
   */
  async del(key: string): Promise<void> {
    if (!this.enabled || !this.redis) {
      return;
    }

    try {
      await this.redis.del(key);
    } catch (error) {
      log.error({ err: error, key }, 'Cache del error');
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern: string): Promise<void> {
    if (!this.enabled || !this.redis) {
      return;
    }

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      log.error({ err: error, pattern }, 'Cache delPattern error');
    }
  }

  /**
   * Check if cache is enabled and connected
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.enabled = false;
    }
  }

  /**
   * Ping Redis to check connection
   */
  async ping(): Promise<boolean> {
    if (!this.enabled || !this.redis) {
      return false;
    }

    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}

/**
 * Cache key builders for different data types
 */
export const CacheKeys = {
  // Price caching - 5 minutes
  price: (coinId: string) => `price:${coinId}`,
  batchPrices: (coinIds: string[]) => `prices:${coinIds.sort().join(',')}`,

  // Quote caching - 30 seconds (quotes change frequently)
  quote: (params: {
    fromChainId: number;
    toChainId: number;
    tokenAddress: string;
    amountWei: string;
  }) => `quote:${params.fromChainId}:${params.toChainId}:${params.tokenAddress}:${params.amountWei}`,

  // Balance caching - 1 minute
  balance: (address: string, chainId: number) => `balance:${address}:${chainId}`,
  balances: (address: string, chainIds: number[]) => `balances:${address}:${chainIds.sort().join(',')}`,

  // Gas price caching - 10 seconds
  gasPrice: (chainId: number) => `gas:${chainId}`,

  // Explorer tokens caching - 10 minutes
  explorerTokens: (chainId: number, address: string) => `explorer:${chainId}:${address}`,
} as const;

/**
 * Cache TTL constants (in seconds)
 */
export const CacheTTL = {
  PRICE: 5 * 60,          // 5 minutes
  BATCH_PRICES: 5 * 60,   // 5 minutes
  QUOTE: 30,              // 30 seconds
  BALANCE: 60,            // 1 minute
  GAS_PRICE: 10,          // 10 seconds
  ETH_PRICE: 2 * 60,      // 2 minutes (used more frequently)
  EXPLORER_TOKENS: 10 * 60, // 10 minutes (token list doesn't change often)
} as const;

// Singleton instance
export const cache = new CacheService();

import { request } from "undici";
import { formatEther } from "viem";
import { cache, CacheKeys, CacheTTL } from "./cache.js";
import { loggers } from "../config/logger.js";

const log = loggers.price;

const COINGECKO_API = "https://api.coingecko.com/api/v3";
const PRICE_CACHE_TTL = 300000; // 5 minutes (in-memory fallback) - increased for public API
const REQUEST_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3; // Maximum retry attempts for rate limits
const INITIAL_RETRY_DELAY = 1000; // 1 second initial delay

interface PriceCache {
  usd: number;
  usd_24h_change?: number;
  timestamp: number;
}

// CoinGecko platform IDs for popular tokens per chain
const TOKEN_COINGECKO_IDS: Record<string, string> = {
  // Stablecoins (use $1 for fast lookup)
  "USDC": "usd-coin",
  "USDT": "tether",
  "DAI": "dai",
  "USDB": "usdb", // Blast stablecoin
  "USDbC": "bridged-usd-coin-base", // Bridged USDC on Base

  // Native tokens
  "ETH": "ethereum",
  "BNB": "binancecoin",
  "AVAX": "avalanche-2",
  "MATIC": "matic-network",
  "xDAI": "xdai", // Gnosis Chain native token (pegged to DAI)
  "CELO": "celo",
  "MNT": "mantle",
  "BLAST": "blast",
};

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Price Oracle for fetching and caching cryptocurrency prices
 * Uses CoinGecko API with fallback to public endpoint
 */
export class PriceOracle {
  private cache = new Map<string, PriceCache>();

  /**
   * Get ETH price in USD
   */
  async getETHPrice(): Promise<number> {
    return this.getPrice("ethereum");
  }

  /**
   * Get native token price for a specific chain
   * Uses chain config to determine the correct native token
   */
  async getNativeTokenPrice(nativeSymbol: string): Promise<number> {
    // xDAI is pegged to DAI which is pegged to USD
    if (nativeSymbol === "xDAI") {
      return 1.0;
    }

    const coinId = TOKEN_COINGECKO_IDS[nativeSymbol];
    if (!coinId) {
      log.warn({ nativeSymbol }, 'No CoinGecko ID for native token, falling back to ETH price');
      return this.getETHPrice();
    }

    return this.getPrice(coinId);
  }

  /**
   * Get price for a token symbol (USDC, ETH, etc.)
   * Returns $1 for stablecoins
   */
  async getTokenPrice(symbol: string, isStablecoin?: boolean): Promise<number> {
    // Stablecoins are always $1
    if (isStablecoin || ["USDC", "USDT", "DAI", "USDB", "USDbC"].includes(symbol)) {
      return 1.0;
    }

    // Get CoinGecko ID for the symbol
    const coinId = TOKEN_COINGECKO_IDS[symbol];
    if (!coinId) {
      log.warn({ symbol }, 'No CoinGecko ID for token symbol');
      return 0;
    }

    return this.getPrice(coinId);
  }

  /**
   * Get price for a specific coin with retry logic
   */
  private async getPrice(coinId: string): Promise<number> {
    // Check Redis cache first
    if (cache.isEnabled()) {
      const redisKey = CacheKeys.price(coinId);
      const cachedPrice = await cache.get<PriceCache>(redisKey);
      if (cachedPrice) {
        return cachedPrice.usd;
      }
    }

    // Check in-memory cache (fallback)
    const cached = this.cache.get(coinId);
    if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
      return cached.usd;
    }

    // Try with retries for rate limits
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const url = new URL(`${COINGECKO_API}/simple/price`);
        url.searchParams.set("ids", coinId);
        url.searchParams.set("vs_currencies", "usd");
        url.searchParams.set("include_24hr_change", "true");

        const response = await request(url.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "Dustless/1.0 (https://github.com/dustless-app; Crypto dust consolidation tool)",
          },
          headersTimeout: REQUEST_TIMEOUT,
          bodyTimeout: REQUEST_TIMEOUT,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        });

        // Handle rate limiting with retry
        if (response.statusCode === 429) {
          const retryAfter = response.headers['retry-after'];
          const delayMs = retryAfter
            ? parseInt(String(retryAfter)) * 1000
            : INITIAL_RETRY_DELAY * Math.pow(2, attempt);

          if (attempt < MAX_RETRIES) {
            log.warn({ delayMs, attempt: attempt + 1, maxRetries: MAX_RETRIES }, 'Rate limited by CoinGecko, retrying');
            await sleep(delayMs);
            continue;
          }
          throw new Error(`Rate limited after ${MAX_RETRIES} retries`);
        }

        if (response.statusCode !== 200) {
          const errorBody = await response.body.text();
          log.error({ statusCode: response.statusCode, body: errorBody }, 'CoinGecko API error');
          throw new Error(`CoinGecko API returned ${response.statusCode}`);
        }

        const data = (await response.body.json()) as Record<
          string,
          { usd: number; usd_24h_change?: number }
        >;

        const priceData = data[coinId];
        if (!priceData) {
          throw new Error(`No price data found for ${coinId}`);
        }

        const priceCache: PriceCache = {
          usd: priceData.usd,
          usd_24h_change: priceData.usd_24h_change,
          timestamp: Date.now(),
        };

        // Cache in Redis with longer TTL for public API
        if (cache.isEnabled()) {
          const ttl = coinId === "ethereum" ? CacheTTL.ETH_PRICE : CacheTTL.PRICE;
          await cache.set(CacheKeys.price(coinId), priceCache, ttl);
        }

        // Cache in memory (fallback)
        this.cache.set(coinId, priceCache);

        return priceData.usd;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // If not a rate limit error, don't retry
        if (!lastError.message.includes('429') && !lastError.message.includes('Rate limited')) {
          break;
        }
      }
    }

    log.error({ coinId, retries: MAX_RETRIES, err: lastError }, 'Failed to fetch price after retries');

    // Return cached value if available, even if stale
    if (cached) {
      log.warn({ coinId, ageSeconds: Math.floor((Date.now() - cached.timestamp) / 1000) }, 'Using stale cache');
      return cached.usd;
    }

    // Fallback to a default value or throw
    throw new Error(`Failed to fetch price for ${coinId} and no cache available`);
  }

  /**
   * Calculate USD value from wei amount (ETH only)
   */
  async calculateUSDValue(weiAmount: string | bigint): Promise<number> {
    try {
      const ethPrice = await this.getETHPrice();
      const wei = typeof weiAmount === "string" ? BigInt(weiAmount) : weiAmount;
      const ethAmount = parseFloat(formatEther(wei));
      return ethAmount * ethPrice;
    } catch (err) {
      log.error({ err }, 'Failed to calculate USD value');
      return 0; // Return 0 on error rather than failing
    }
  }

  /**
   * Calculate USD value for any token (ETH or ERC-20)
   * @param balance Raw balance in smallest unit
   * @param decimals Token decimals (18 for ETH, 6 for USDC, etc.)
   * @param symbol Token symbol (ETH, USDC, etc.)
   * @param isStablecoin Whether token is a stablecoin
   */
  async calculateTokenUSDValue(
    balance: string | bigint,
    decimals: number,
    symbol: string,
    isStablecoin?: boolean
  ): Promise<number> {
    try {
      const price = await this.getTokenPrice(symbol, isStablecoin);
      const balanceBigInt = typeof balance === "string" ? BigInt(balance) : balance;

      // Convert balance to float using decimals
      const divisor = BigInt(10 ** decimals);
      const tokenAmount = Number(balanceBigInt) / Number(divisor);

      return tokenAmount * price;
    } catch (err) {
      log.error({ err, symbol }, 'Failed to calculate USD value for token');
      return 0;
    }
  }

  /**
   * Get multiple prices at once (batch request)
   */
  async getBatchPrices(
    coinIds: string[]
  ): Promise<Record<string, number>> {
    // Check Redis cache for batch prices
    if (cache.isEnabled()) {
      const cacheKey = CacheKeys.batchPrices(coinIds);
      const cachedBatch = await cache.get<Record<string, number>>(cacheKey);
      if (cachedBatch) {
        return cachedBatch;
      }
    }

    try {
      const url = new URL(`${COINGECKO_API}/simple/price`);
      url.searchParams.set("ids", coinIds.join(","));
      url.searchParams.set("vs_currencies", "usd");

      const response = await request(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        headersTimeout: REQUEST_TIMEOUT,
        bodyTimeout: REQUEST_TIMEOUT,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (response.statusCode !== 200) {
        throw new Error(`CoinGecko API returned ${response.statusCode}`);
      }

      const data = (await response.body.json()) as Record<
        string,
        { usd: number }
      >;

      // Cache all results
      const prices: Record<string, number> = {};
      for (const [coinId, priceData] of Object.entries(data)) {
        const priceCache: PriceCache = {
          usd: priceData.usd,
          timestamp: Date.now(),
        };

        // Cache individual prices in Redis
        if (cache.isEnabled()) {
          const ttl = coinId === "ethereum" ? CacheTTL.ETH_PRICE : CacheTTL.PRICE;
          await cache.set(CacheKeys.price(coinId), priceCache, ttl);
        }

        // Cache in memory (fallback)
        this.cache.set(coinId, priceCache);
        prices[coinId] = priceData.usd;
      }

      // Cache batch result in Redis
      if (cache.isEnabled()) {
        await cache.set(CacheKeys.batchPrices(coinIds), prices, CacheTTL.BATCH_PRICES);
      }

      return prices;
    } catch (err) {
      log.error({ err, coinIds }, 'Failed to fetch batch prices');
      return {};
    }
  }

  /**
   * Clear the price cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

// Singleton instance
export const priceOracle = new PriceOracle();

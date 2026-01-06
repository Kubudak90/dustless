import { request } from "undici";
import { formatEther } from "viem";

const COINGECKO_API = "https://api.coingecko.com/api/v3";
const PRICE_CACHE_TTL = 60000; // 1 minute
const REQUEST_TIMEOUT = 10000; // 10 seconds

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
  "BLAST": "blast",
};

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
      console.warn(`No CoinGecko ID for token symbol: ${symbol}`);
      return 0;
    }

    return this.getPrice(coinId);
  }

  /**
   * Get price for a specific coin
   */
  private async getPrice(coinId: string): Promise<number> {
    // Check cache first
    const cached = this.cache.get(coinId);
    if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
      return cached.usd;
    }

    try {
      const url = new URL(`${COINGECKO_API}/simple/price`);
      url.searchParams.set("ids", coinId);
      url.searchParams.set("vs_currencies", "usd");
      url.searchParams.set("include_24hr_change", "true");

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
        { usd: number; usd_24h_change?: number }
      >;

      const priceData = data[coinId];
      if (!priceData) {
        throw new Error(`No price data found for ${coinId}`);
      }

      // Cache the result
      this.cache.set(coinId, {
        usd: priceData.usd,
        usd_24h_change: priceData.usd_24h_change,
        timestamp: Date.now(),
      });

      return priceData.usd;
    } catch (err) {
      console.error(`Failed to fetch price for ${coinId}:`, err);

      // Return cached value if available, even if stale
      if (cached) {
        console.warn(`Using stale cache for ${coinId}`);
        return cached.usd;
      }

      // Fallback to a default value or throw
      throw new Error(`Failed to fetch price for ${coinId} and no cache available`);
    }
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
      console.error("Failed to calculate USD value:", err);
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
      console.error(`Failed to calculate USD value for ${symbol}:`, err);
      return 0;
    }
  }

  /**
   * Get multiple prices at once (batch request)
   */
  async getBatchPrices(
    coinIds: string[]
  ): Promise<Record<string, number>> {
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
        this.cache.set(coinId, {
          usd: priceData.usd,
          timestamp: Date.now(),
        });
        prices[coinId] = priceData.usd;
      }

      return prices;
    } catch (err) {
      console.error("Failed to fetch batch prices:", err);
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

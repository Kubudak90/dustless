import type { SwapQuote, SwapRequest, SwapBuildRequest, TxStep } from "@dustless/shared";

/**
 * Abstract interface for DEX aggregator swap providers
 * Implementations: Odos
 */
export interface SwapProvider {
  /** Provider identifier */
  readonly name: SwapQuote["provider"];

  /**
   * Get swap quotes for a token exchange
   * Returns the best route to swap tokens on the same chain
   */
  quote(req: SwapRequest): Promise<SwapQuote[]>;

  /**
   * Build transaction(s) for a selected swap quote
   * Returns steps that need to be executed in order
   */
  build(req: SwapBuildRequest): Promise<TxStep[]>;
}

/**
 * Swap provider registry
 */
export class SwapProviderRegistry {
  private providers = new Map<string, SwapProvider>();

  register(provider: SwapProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): SwapProvider | undefined {
    return this.providers.get(name);
  }

  all(): SwapProvider[] {
    return Array.from(this.providers.values());
  }
}

export const swapRegistry = new SwapProviderRegistry();

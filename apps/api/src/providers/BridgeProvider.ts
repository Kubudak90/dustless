import type { Quote, QuoteRequest, BuildRequest, TxStep } from "@dustless/shared";

/**
 * Abstract interface for bridge providers
 * Implementations: LI.FI, Socket/Bungee
 */
export interface BridgeProvider {
  /** Provider identifier */
  readonly name: Quote["provider"];

  /**
   * Get quotes for a cross-chain transfer
   * May return multiple routes with different trade-offs
   */
  quote(req: QuoteRequest): Promise<Quote[]>;

  /**
   * Build transaction(s) for a selected quote
   * Returns steps that need to be executed in order
   */
  build(req: BuildRequest): Promise<TxStep[]>;
}

/**
 * Provider registry
 */
export class ProviderRegistry {
  private providers = new Map<string, BridgeProvider>();

  register(provider: BridgeProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): BridgeProvider | undefined {
    return this.providers.get(name);
  }

  all(): BridgeProvider[] {
    return Array.from(this.providers.values());
  }
}

export const registry = new ProviderRegistry();

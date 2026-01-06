import type {
  ScanRequest,
  ScanResponse,
  QuoteRequest,
  QuoteResponse,
  BuildRequest,
  BuildResponse,
  SwapRequest,
  SwapResponse,
  SwapBuildRequest,
  ApiError,
} from "@dustless/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;
    throw new Error(error.error ?? "API request failed");
  }

  return data as T;
}

export const api = {
  /**
   * Scan chains for stuck assets
   */
  scan: (req: ScanRequest) =>
    apiRequest<ScanResponse>("/scan", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  /**
   * Get bridge quotes
   */
  quote: (req: QuoteRequest) =>
    apiRequest<QuoteResponse>("/quote", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  /**
   * Build transaction for a quote
   */
  build: (req: BuildRequest) =>
    apiRequest<BuildResponse>("/build", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  /**
   * Get swap quotes (token → ETH via Odos)
   */
  swap: (req: SwapRequest) =>
    apiRequest<SwapResponse>("/swap", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  /**
   * Build transaction for a swap quote
   */
  swapBuild: (req: SwapBuildRequest) =>
    apiRequest<BuildResponse>("/swap/build", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  /**
   * Health check
   */
  health: () => apiRequest<{ ok: boolean }>("/health"),
};

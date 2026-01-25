/**
 * Simple Metrics Tracking Service
 * Tracks API usage, performance, and errors
 * In-memory storage with periodic aggregation
 */

interface MetricCounter {
  count: number;
  lastUpdated: number;
}

interface MetricHistogram {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p95: number;
  values: number[];
}

class MetricsCollector {
  private counters = new Map<string, MetricCounter>();
  private histograms = new Map<string, MetricHistogram>();
  private readonly maxHistogramValues = 1000; // Keep last 1000 values for percentiles

  /**
   * Increment a counter metric
   */
  incrementCounter(name: string, value: number = 1): void {
    const existing = this.counters.get(name);
    if (existing) {
      existing.count += value;
      existing.lastUpdated = Date.now();
    } else {
      this.counters.set(name, {
        count: value,
        lastUpdated: Date.now(),
      });
    }
  }

  /**
   * Record a value in a histogram (for latency, sizes, etc.)
   */
  recordHistogram(name: string, value: number): void {
    const existing = this.histograms.get(name);

    if (existing) {
      existing.count++;
      existing.sum += value;
      existing.min = Math.min(existing.min, value);
      existing.max = Math.max(existing.max, value);
      existing.values.push(value);

      // Keep only recent values
      if (existing.values.length > this.maxHistogramValues) {
        existing.values.shift();
      }

      // Recalculate stats
      existing.avg = existing.sum / existing.count;
      existing.p95 = this.calculatePercentile(existing.values, 95);
    } else {
      this.histograms.set(name, {
        count: 1,
        sum: value,
        min: value,
        max: value,
        avg: value,
        p95: value,
        values: [value],
      });
    }
  }

  /**
   * Calculate percentile from sorted values
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  /**
   * Get all counters
   */
  getCounters(): Record<string, MetricCounter> {
    return Object.fromEntries(this.counters.entries());
  }

  /**
   * Get all histograms (without raw values for memory efficiency)
   */
  getHistograms(): Record<string, Omit<MetricHistogram, 'values'>> {
    const result: Record<string, Omit<MetricHistogram, 'values'>> = {};

    for (const [name, histogram] of this.histograms.entries()) {
      result[name] = {
        count: histogram.count,
        sum: histogram.sum,
        min: histogram.min,
        max: histogram.max,
        avg: histogram.avg,
        p95: histogram.p95,
      };
    }

    return result;
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): {
    counters: Record<string, MetricCounter>;
    histograms: Record<string, Omit<MetricHistogram, 'values'>>;
    timestamp: string;
  } {
    return {
      counters: this.getCounters(),
      histograms: this.getHistograms(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
  }
}

// Singleton instance
export const metrics = new MetricsCollector();

/**
 * Metric names as constants
 */
export const MetricNames = {
  // Request counters
  REQUESTS_TOTAL: 'requests_total',
  REQUESTS_SCAN: 'requests_scan',
  REQUESTS_QUOTE: 'requests_quote',
  REQUESTS_BUILD: 'requests_build',

  // Error counters
  ERRORS_TOTAL: 'errors_total',
  ERRORS_VALIDATION: 'errors_validation',
  ERRORS_PROVIDER: 'errors_provider',
  ERRORS_RPC: 'errors_rpc',
  ERRORS_TIMEOUT: 'errors_timeout',

  // Deduplication
  REQUESTS_DEDUPLICATED: 'requests_deduplicated',

  // Cache
  CACHE_HITS: 'cache_hits',
  CACHE_MISSES: 'cache_misses',

  // Histograms (latency, sizes)
  REQUEST_DURATION_MS: 'request_duration_ms',
  SCAN_DURATION_MS: 'scan_duration_ms',
  QUOTE_DURATION_MS: 'quote_duration_ms',
  PRICE_FETCH_DURATION_MS: 'price_fetch_duration_ms',

  // Provider specific
  PROVIDER_LIFI_SUCCESS: 'provider_lifi_success',
  PROVIDER_LIFI_FAILURE: 'provider_lifi_failure',
  PROVIDER_SOCKET_SUCCESS: 'provider_socket_success',
  PROVIDER_SOCKET_FAILURE: 'provider_socket_failure',
} as const;

/**
 * Middleware to track request metrics
 */
export async function trackRequestMetrics<T>(
  metricName: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await fn();
    const duration = Date.now() - startTime;

    // Record success
    metrics.incrementCounter(metricName);
    metrics.recordHistogram(`${metricName}_duration_ms`, duration);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Record failure
    metrics.incrementCounter(`${metricName}_error`);
    metrics.recordHistogram(`${metricName}_duration_ms`, duration);

    throw error;
  }
}

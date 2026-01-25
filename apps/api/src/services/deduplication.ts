import { loggers } from "../config/logger.js";

const log = loggers.dedup;

/**
 * Request Deduplication Service
 * Prevents duplicate requests from being processed simultaneously
 * Uses in-memory cache with automatic cleanup
 */

interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

const pendingRequests = new Map<string, PendingRequest<any>>();
const CLEANUP_INTERVAL = 60000; // 1 minute
const MAX_AGE = 300000; // 5 minutes

/**
 * Deduplicate a request by key
 * If the same key is already being processed, return the existing promise
 */
export async function deduplicateRequest<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // Check if request is already pending
  const existing = pendingRequests.get(key);
  if (existing) {
    log.debug({ key }, 'Request deduplicated');
    return existing.promise;
  }

  // Execute the request
  const promise = fn().finally(() => {
    // Remove from pending after completion
    pendingRequests.delete(key);
  });

  // Store the pending request
  pendingRequests.set(key, {
    promise,
    timestamp: Date.now(),
  });

  return promise;
}

/**
 * Create a deduplication key from request parameters
 */
export function createDeduplicationKey(
  endpoint: string,
  params: Record<string, any>
): string {
  // Sort keys for consistent hashing
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${JSON.stringify(params[key])}`)
    .join("&");

  return `${endpoint}:${sortedParams}`;
}

/**
 * Cleanup old pending requests (should never happen in normal operation)
 * This is a safety mechanism to prevent memory leaks
 */
function cleanupOldRequests(): void {
  const now = Date.now();
  const toDelete: string[] = [];

  for (const [key, request] of pendingRequests.entries()) {
    if (now - request.timestamp > MAX_AGE) {
      toDelete.push(key);
    }
  }

  toDelete.forEach((key) => {
    log.warn({ key }, 'Cleaning up stale request');
    pendingRequests.delete(key);
  });

  if (toDelete.length > 0) {
    log.info({ count: toDelete.length }, 'Cleaned up stale requests');
  }
}

// Start periodic cleanup
setInterval(cleanupOldRequests, CLEANUP_INTERVAL);

/**
 * Get deduplication statistics
 */
export function getDeduplicationStats(): {
  pendingRequests: number;
  keys: string[];
} {
  return {
    pendingRequests: pendingRequests.size,
    keys: Array.from(pendingRequests.keys()),
  };
}

/**
 * Clear all pending requests (useful for testing)
 */
export function clearDeduplicationCache(): void {
  pendingRequests.clear();
}

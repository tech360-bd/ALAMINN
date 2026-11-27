/**
 * Small in-process rate limiter for the public AI Services endpoint.
 * A shared/Redis-backed limiter is required for multi-instance production;
 * until then this is a best-effort guard, not a security boundary.
 */
import { createHash } from "node:crypto";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function createRateLimiter(maxRequests: number, windowMs: number, maxKeys = 10_000) {
  const counters = new Map<string, { count: number; resetAt: number }>();
  let nextSweep = 0;
  let earliestReset = Infinity;

  function sweep(now: number) {
    earliestReset = Infinity;
    for (const [key, entry] of counters) {
      if (entry.resetAt <= now) counters.delete(key);
      else earliestReset = Math.min(earliestReset, entry.resetAt);
    }
    nextSweep = now + Math.min(windowMs, 60_000);
  }

  return {
    check(key: string, now = Date.now()): RateLimitResult {
      if (now >= nextSweep) sweep(now);
      const entry = counters.get(key);
      if (!entry || entry.resetAt <= now) {
        // Do not evict active buckets: that would let attackers reset limits.
        // At capacity, clear expired buckets, then fail closed for new keys.
        if (!entry && counters.size >= maxKeys) {
          if (earliestReset <= now) sweep(now);
          if (counters.size >= maxKeys) {
            return { allowed: false, remaining: 0, resetAt: earliestReset };
          }
        }
        const resetAt = now + windowMs;
        counters.set(key, { count: 1, resetAt });
        earliestReset = Math.min(earliestReset, resetAt);
        return { allowed: true, remaining: maxRequests - 1, resetAt };
      }
      if (entry.count >= maxRequests) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt };
      }
      entry.count += 1;
      return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
    },
    reset() {
      counters.clear();
      nextSweep = 0;
    },
  };
}

/** Hash a client key so raw IPs never enter logs or in-memory keys. */
export function clientKey(identifier: string, salt = "ai-services"): string {
  return createHash("sha256").update(`${salt}:${identifier}`).digest("hex").slice(0, 24);
}

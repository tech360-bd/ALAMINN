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

export function createRateLimiter(maxRequests: number, windowMs: number) {
  const counters = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string, now = Date.now()): RateLimitResult {
      const entry = counters.get(key);
      if (!entry || entry.resetAt <= now) {
        const resetAt = now + windowMs;
        counters.set(key, { count: 1, resetAt });
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
    },
  };
}

/** Hash a client key so raw IPs never enter logs or in-memory keys. */
export function clientKey(identifier: string, salt = "ai-services"): string {
  return createHash("sha256").update(`${salt}:${identifier}`).digest("hex").slice(0, 24);
}

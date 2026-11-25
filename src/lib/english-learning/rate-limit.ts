/**
 * English Learning — simple in-memory rate limiter.
 * --------------------------------------------------------------------
 * Per-key request counter using a sliding 1-minute window stored in a
 * Map. Designed for use inside Next.js route handlers (one bucket per
 * IP hash, session ID, or any other stable identifier).
 *
 * Mirrors `src/lib/higher-study/rate-limit.ts`. NOT a distributed rate
 * limiter — acceptable for the public APIs where the primary goal is
 * to deter scripted abuse rather than enforce hard quotas.
 */

const WINDOW_MS = 60_000;

type Bucket = { count: number; reset: number };

const buckets = new Map<string, Bucket>();

/**
 * Returns `true` if the caller has exceeded `maxPerMinute` requests in
 * the current 1-minute window.
 */
export function rateLimit(key: string, maxPerMinute: number): boolean {
  if (!key) key = "anonymous";
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.reset) {
    buckets.set(key, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > maxPerMinute;
}

/** Test-only helper. */
export function __resetRateLimiterForTests(): void {
  buckets.clear();
}

// Periodic janitor — purge expired buckets every 5 minutes.
if (typeof setInterval !== "undefined") {
  const handle = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) {
      if (now > v.reset) buckets.delete(k);
    }
  }, 5 * 60_000);
  if (typeof handle === "object" && handle && "unref" in handle) {
    (handle as { unref: () => void }).unref();
  }
}

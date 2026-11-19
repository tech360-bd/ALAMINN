/**
 * In-memory fixed-window rate limiter for sensitive endpoints (login, password
 * reset, registration). Keyed by ip(+email). Per-process; production
 * deployments behind a shared load balancer should point LOGIN_RATE_LIMIT_* at
 * a shared store — the limiter interface stays identical.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let nextSweep = 0;

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export function rateLimit({ key, limit, windowMs }: RateLimitOptions): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (now >= nextSweep) {
    for (const [id, value] of buckets) if (value.resetAt <= now) buckets.delete(id);
    nextSweep = now + 60_000;
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

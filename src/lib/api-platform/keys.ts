/**
 * API keys — hashed storage + scope-aware verification for the public
 * API platform and the ecosystem bridge.
 *
 * SECURITY:
 *  - Raw keys are shown exactly once at creation time; only sha256
 *    hashes are persisted (ApiKey.hashedKey).
 *  - Keys use a recognizable prefix (`ak_live_`) so they can be
 *    identified in logs and revoked by prefix if ever leaked.
 *  - Scope strings are namespaced `resource:action` and checked with
 *    hasScope (wildcard "*" grants everything — super keys only).
 */

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const API_KEY_SCOPES = [
  "leads:read",
  "leads:write",
  "applications:read",
  "applications:write",
  "copilot:invoke",
  "webhooks:manage",
  "usage:read",
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const ALL_SCOPES: ApiKeyScope[] = [...API_KEY_SCOPES];

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

/** Generate a new raw key. Returned once; never persisted raw. */
export function generateApiKey(): { rawKey: string; prefix: string; hashedKey: string } {
  const rawKey = `ak_live_${randomBytes(24).toString("hex")}`;
  return { rawKey, prefix: rawKey.slice(0, 10), hashedKey: hashApiKey(rawKey) };
}

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(API_KEY_SCOPES.length).default(["leads:write"]),
  rateLimitPerMin: z.number().int().min(5).max(600).default(60),
});
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: string;
  rateLimitPerMin: number;
}

export function hasScope(record: Pick<ApiKeyRecord, "scopes">, required: ApiKeyScope): boolean {
  const scopes = record.scopes ?? [];
  return scopes.includes("*") || scopes.includes(required);
}

// ─── In-memory sliding-window rate limiter (per key) ────────────────────────

interface RateBucket { count: number; resetAt: number; }
const buckets = new Map<string, RateBucket>();
const MAX_BUCKETS = 8192;

export function checkKeyRateLimit(
  keyId: string,
  maxRequests: number,
  windowMs = 60_000
): { allowed: boolean; retryAfterSec: number; remaining: number } {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, v] of buckets.entries()) if (v.resetAt <= now) buckets.delete(k);
  }
  const existing = buckets.get(keyId);
  if (!existing || existing.resetAt <= now) {
    buckets.set(keyId, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0, remaining: maxRequests - 1 };
  }
  if (existing.count >= maxRequests) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)), remaining: 0 };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSec: 0, remaining: maxRequests - existing.count };
}

/** Test-only: clear rate-limit state. */
export function resetKeyRateLimits(): void {
  buckets.clear();
}

/**
 * Single source of truth for authentication signing secrets.
 * Kept dependency-free so both the Node.js app and `src/proxy.ts` resolve
 * the exact same keys across the two authentication domains:
 *
 *   1. Command Center (`User` / `auth_token` JWT):
 *      Resolved via `resolveAuthSecret()` — prefers `JWT_SECRET`, then
 *      `AUTH_SECRET`. Requires >= 32 bytes in production (throws on
 *      missing/short secret). Falls back to `DEV_FALLBACK_SECRET` only in
 *      non-production when neither env var is set.
 *
 *   2. ALO Education Staff & UCI/UMC (`StaffAccount` / `alo_session` HMAC):
 *      Resolved via `resolveStaffSecret()` — prefers `SESSION_SECRET`, then
 *      `JWT_SECRET`, then `AUTH_SECRET`. Requires >= 32 bytes in production
 *      (returns `null` to fail closed) and >= 16 bytes when explicitly set
 *      in non-production, falling back to `DEV_FALLBACK_SECRET` only in
 *      non-production when no secret env var is set.
 */
export const DEV_FALLBACK_SECRET =
  "dev-fallback-secret-please-set-JWT_SECRET-to-a-32+-byte-random-string";

export function resolveAuthSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production" && Buffer.byteLength(secret) < 32) {
    throw new Error("A production JWT signing secret of at least 32 bytes is required");
  }
  return secret || DEV_FALLBACK_SECRET;
}

/** Staff session signing secret for proxy, route handlers, and UMC services. */
export function resolveStaffSecret(): string | null {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET || process.env.AUTH_SECRET;
  const minimum = process.env.NODE_ENV === "production" ? 32 : 16;
  if (secret !== undefined && secret !== "") {
    return Buffer.byteLength(secret) >= minimum ? secret : null;
  }
  if (process.env.NODE_ENV !== "production") {
    return DEV_FALLBACK_SECRET;
  }
  return null;
}

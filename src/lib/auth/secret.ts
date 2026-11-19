/**
 * Single source of truth for the auth signing secret.
 * Kept dependency-free so both the Node.js app and `src/proxy.ts` resolve
 * the exact same key.
 *
 * Preference order (Rule 5):
 *   1. JWT_SECRET   — canonical name in .env.config
 *   2. AUTH_SECRET  — legacy name kept for existing deployments
 *   3. dev-only fallback (never used in production; env() hard-fails instead)
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

/** Same staff signing configuration for proxy, route handlers and services. */
export function resolveStaffSecret(): string | null {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET || process.env.AUTH_SECRET;
  const minimum = process.env.NODE_ENV === "production" ? 32 : 16;
  return secret && Buffer.byteLength(secret) >= minimum ? secret : null;
}

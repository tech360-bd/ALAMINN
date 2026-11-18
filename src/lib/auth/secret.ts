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
  return secret || DEV_FALLBACK_SECRET;
}

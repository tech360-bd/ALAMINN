# Security: CSP, Auth, and Rate Limiting

## CSP (staged hardening)
- Global CSP is applied in `src/proxy.ts`.
- **Production:** `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com` (no `unsafe-eval`), `upgrade-insecure-requests` enabled.
- **Development:** retains `unsafe-eval` for Next/dev tooling and allows local preview frame ancestors.
- **Remaining exception:** `unsafe-inline` in script/style sources remains until nonce/hash CSP propagation is implemented. Track as follow-up.

## Auth secrets
- Production requires `JWT_SECRET` or `AUTH_SECRET` with >=32 bytes (`src/lib/auth/secret.ts`, `server.js` startup validation).
- `SESSION_SECRET` should be >=32 bytes; missing/short in production causes staff session routes to fail closed.
- `CRON_SECRET` required for cron-protected endpoints.

## Auth rate limiting
- Login/forgot-password/reset-password use process-local bounded in-memory rate limiters (`src/lib/auth/rate-limit.ts`).
- Limits are defense-in-depth and memory-bounded; multi-instance deployments should use a shared store (Redis/DB) for global enforcement.
- Responses are non-enumerating where applicable (forgot-password).

## Password reset
- Reset tokens are random, stored with expiry, single-use (cleared on successful reset), and never returned in forgot-password responses.
- Invalid/expired/reused tokens are rejected.

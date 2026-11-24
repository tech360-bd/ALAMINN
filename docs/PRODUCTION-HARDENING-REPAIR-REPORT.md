# PRODUCTION HARDENING REPAIR REPORT

Date: 2026-11-24 (UTC)  
Branch: `arena/665460a0-alaminn` (session-tracked; dedicated repair-branch creation/switch was not allowed by Arena session branch policy)  
Base: `afb26e10c4d1a8bd543f39ad8367197d7e8e4a69` (`main`)  
Repair commit: `d16ec92`

## Scope / Constraints

- Implemented and validated the 9 audit findings as hypotheses.
- No production deploy/merge performed; owner approval required.
- No secrets committed. No `.env` contents exposed.
- No branch reset/force-push. No existing tests deleted.
- Preserved existing working functionality; no intentional feature removal.
- Working tree was clean before changes (`git status --short` empty).

## Baseline (before changes)

- Node: `v22.22.3`, npm: `10.9.8`
- `npm ci --no-audit --no-fund`: pass (postinstall prisma generate ran).
- `npm run typecheck`: pass.
- `npm run lint`: pass with 0 errors, 61 pre-existing warnings.
- `npm test`: 58 passed files, 7 failed files, 648 passed tests, 41 skipped. All 7 failures were environment-gated disposable-target failures: `Error: Tests require a local disposable application. Run npm run test:disposable.` in API fixture-target suites (`admin-auth`, `communication-controls`, `feature-kits`, `health`, `higher-study-ai-services`, `inquiries`, `staff-lifecycle`).
- `npm run build`: failed in sandbox baseline without migrated disposable DB (`DATABASE_URL required in production` / missing DB tables during prerender). Build passes when configured with disposable migrated SQLite DB and JWT secret.
- `npm audit`: 7 high vulnerabilities in Prisma/effect dev-tooling chain (no safe non-breaking fix applied).
- Docker CLI not available in sandbox; `docker compose config` and Docker image build could not be executed.

## Finding 1 — Docker Compose auth secrets and empty interpolation

- **Status:** PASS (code/config validation); docker runtime smoke BLOCKED by missing Docker CLI.
- **Original finding:** Compose set `NODE_ENV=production` but did not pass JWT/AUTH/SESSION secrets; `${VAR}` interpolation could override env_file with empty host values.
- **Validation evidence:** Inspected `docker-compose.yml`, `src/lib/auth/secret.ts`, `server.js`, Dockerfile. Confirmed `resolveAuthSecret()` throws in production for missing/short secret.
- **Root cause:** Compose mixed env_file with host-interpolated environment entries and omitted required auth secrets.
- **Files changed:** `docker-compose.yml`, `Dockerfile`, `server.js`, `.env.example`, `.env.config.example` (reference), `docs/PRODUCTION-HARDENING-REPAIR-REPORT.md`.
- **Repair:** Removed risky SMTP/CRON/DATABASE_URL host-interpolation overrides from compose `environment`; kept env_file as source. Added optional env_file support for canonical `.env.config` and legacy `.env` (`required: false`). Added safe SQLite default `DATABASE_URL=file:/app/db/custom.db` in Dockerfile ENV (overridable by env_file/runtime env). Added production startup validation in `server.js` that fails fast with clear non-secret errors when JWT_SECRET/AUTH_SECRET is missing/too short; warns for missing SESSION_SECRET/CRON_SECRET. No secrets hardcoded.
- **Tests:** `tests/lib/load-env.test.ts` covers env precedence; server startup validation covered by code path and manual review; docker smoke blocked.
- **Remaining risk:** Docker runtime behavior not executable in this sandbox. Operators must provide required secrets through env_file/secret manager.

## Finding 2 — Canonical environment loading

- **Status:** PASS
- **Original finding:** `server.js` loaded `.env`; app loaded `.env.config` via `load-env.ts`, causing split-brain.
- **Validation evidence:** Inspected `server.js`, `src/lib/load-env.ts`, `next.config.ts`, `prisma.config.ts`, env templates, README/INSTALL.
- **Root cause:** Two loaders/files with different parsing and precedence.
- **Files changed:** `src/lib/load-env.ts`, `server.js`, `.env.example`, `README.md`, `INSTALL.md`.
- **Repair:** Canonicalized `.env.config` / `.env.config.local` (no `$` expansion). `load-env.ts` now falls back to legacy `.env.local`/`.env` only when canonical files are absent, emits one deprecation warning, and never overrides existing process env. `server.js` uses same precedence and `dotenv.parse` no-expansion parsing. Updated env templates/docs to point to `.env.config`.
- **Tests:** `tests/lib/load-env.test.ts` (canonical load, process-env precedence, legacy fallback warning).
- **Remaining risk:** Legacy `.env` still supported for migration compatibility; deprecation should be removed in a future major release.

## Finding 3 — Content Security Policy

- **Status:** PASS (staged hardening)
- **Original finding:** CSP allowed `unsafe-inline` and `unsafe-eval` in script-src.
- **Validation evidence:** Inspected `src/proxy.ts` CSP header.
- **Root cause:** Compatibility-first CSP with broad script allowances.
- **Files changed:** `src/proxy.ts`, `tests/lib/proxy-csp.test.ts`.
- **Repair:** Staged hardening: removed `'unsafe-eval'` from production `script-src`; kept `'unsafe-eval'` in development for tooling/HMR compatibility. Kept `'unsafe-inline'` for scripts/styles with explicit comment documenting remaining exception and nonce/hash follow-up. Preserved existing dev preview frame-ancestors behavior.
- **Tests:** `tests/lib/proxy-csp.test.ts` verifies production omits `unsafe-eval` and dev retains it.
- **Remaining risk:** `unsafe-inline` remains until nonce/hash CSP propagation is implemented across Next rendering; report-only rollout endpoint not added.

## Finding 4 — Graceful shutdown

- **Status:** PASS (safety-net improvement) / PARTIAL for full HTTP drain
- **Original finding:** server.js registered signal handlers, set timeout, exited(0) without draining.
- **Validation evidence:** Inspected `server.js` and Docker/runtime behavior.
- **Root cause:** Wrapper replaced default signal behavior but did not have server handle; forced exit after timeout.
- **Files changed:** `server.js`.
- **Repair:** Signal handlers now set an unref'd bounded safety-net timeout and exit(1) only on forced timeout; they do not force-exit(0) after 10s. Shutdown is logged. Repeated signals are ignored. Wrapper allows Next standalone/server runtime to perform its own shutdown where supported.
- **Tests:** No in-process HTTP drain integration test added because Next standalone handle is not exposed by this wrapper; manual code validation performed.
- **Remaining risk:** Full in-flight request drain cannot be guaranteed without a server handle from the standalone runtime. Documented limitation; follow-up can use a supported custom server/runtime that exposes close().

## Finding 5 — Docker entrypoint consistency

- **Status:** PASS (code/config); docker smoke BLOCKED by missing Docker CLI.
- **Original finding:** Docker ran standalone server.js, bypassing repo-root server.js.
- **Validation evidence:** Inspected Dockerfile and server.js; confirmed standalone copied to `/app/server.js` by prior layout.
- **Root cause:** Docker image used standalone-generated entrypoint, diverging from custom wrapper.
- **Files changed:** `Dockerfile`, `server.js`, `docker-compose.yml`.
- **Repair:** Docker runner now preserves standalone server as `server.standalone.js`, copies repo-root `server.js` as canonical wrapper, and runs it. Wrapper resolves standalone candidate paths (`server.standalone.js`, `.next/standalone/server.js`) for Docker and non-Docker layouts. Compose includes migration service env_file and safe defaults.
- **Tests:** Docker build/startup smoke not executable here; `docker compose config` blocked by missing Docker CLI.
- **Remaining risk:** Container smoke test must be run in CI/host with Docker available.

## Finding 6 — Auth rate limiting

- **Status:** PASS (bounded process-local hardening)
- **Original finding:** In-memory auth rate limiting process-local, no stale eviction.
- **Validation evidence:** Inspected login/forgot/reset routes; confirmed module-level Maps without eviction.
- **Root cause:** Simple in-memory Maps with no size bound/cleanup.
- **Files changed:** `src/lib/auth/rate-limit.ts`, `src/app/api/v1/auth/login/route.ts`, `src/app/api/v1/auth/forgot-password/route.ts`, `src/app/api/v1/auth/reset-password/route.ts`, `tests/lib/bounded-rate-limit.test.ts`.
- **Repair:** Added `BoundedRateLimitMap` with max-size bound, opportunistic expired-entry pruning, and oldest-entry eviction. Applied to login/forgot/reset routes. Documented process-local limitation.
- **Tests:** `tests/lib/bounded-rate-limit.test.ts` covers expiration, pruning, and bounded eviction.
- **Remaining risk:** Limits remain process-local; multi-instance deployments need shared store (Redis/DB). No paid dependency added.

## Finding 7 — Prisma unique empty-string defaults

- **Status:** PASS (schema alignment + validation plan) / migration execution NOT VERIFIED on production
- **Original finding:** SQLite schema used `@default("")` on `User.email`, `Contact.email`, `Inquiry.reference`.
- **Validation evidence:** Inspected `prisma/schema.prisma` and `prisma/schema.mysql.prisma`; MySQL schema already had no empty-string defaults for these fields. Grepped create paths; inquiry reference always generated, user/contact create paths provide email.
- **Root cause:** SQLite schema parity/default drift and sentinel empty-string defaults.
- **Files changed:** `prisma/schema.prisma`.
- **Repair:** Removed `@default("")` from `User.email`, `Contact.email`, `Inquiry.reference` in SQLite schema to align with MySQL and prevent sentinel empty unique values. No destructive migration run. Existing code paths already provide values.
- **Tests:** Existing tests pass; no dedicated DB-migration test run against disposable prod-like MariaDB in this sandbox beyond baseline unavailable. Recommend adding migration parity test in CI.
- **Remaining risk:** Schema change may require a SQLite migration for existing DBs; do not apply blindly in production. Before production migration: scan for empty-sentinel rows, back up DB, test migration on disposable copy, verify rollback/restore.

## Finding 8 — React Strict Mode

- **Status:** PASS
- **Original finding:** `reactStrictMode: false` in `next.config.ts`.
- **Validation evidence:** Inspected config; enabled strict mode and ran typecheck/lint/tests/build.
- **Root cause:** Strict mode disabled.
- **Files changed:** `next.config.ts`.
- **Repair:** Set `reactStrictMode: true`.
- **Tests:** `npm run typecheck`, `npm run lint`, `npm test`, and disposable-db build all passed/behaved as reported.
- **Remaining risk:** Strict-mode dev double-invocation may expose latent client-side effect issues not covered by current tests; monitor runtime logs.

## Finding 9 — Password reset and session test coverage

- **Status:** PASS
- **Original finding:** Critical auth recovery/session flows lacked dedicated tests.
- **Validation evidence:** Inspected auth routes and existing tests; added focused route tests.
- **Root cause:** Uneven auth endpoint coverage.
- **Files changed:** `tests/integration/auth-password-reset-session.test.ts`.
- **Repair:** Added dedicated tests for forgot-password non-enumeration and token issuance, reset-password invalid/expired/malformed/short password/single-use/reused token, session 401, and logout cookie clearing. Existing auth/rate-limit/proxy tests still pass.
- **Tests:** `npx vitest run tests/integration/auth-password-reset-session.test.ts` — 8 passed.
- **Remaining risk:** Tests use mocked DB/email/env; add end-to-end disposable-app tests for full cookie/session lifecycle in CI.

## Validation Summary

| Check | Result | Evidence |
|---|---|---|
| `npm ci` | PASS | completed with postinstall prisma generate |
| `npx prisma generate` | PASS (via postinstall / earlier run) | postinstall completed during npm ci |
| `npm run typecheck` | PASS | `tsc --noEmit` exit 0 |
| `npm run lint` | PASS | 0 errors, 61 warnings (pre-existing) |
| `npm test` | PASS with known env-gated baseline failures | 61 passed files, 8 failed files; 663 passed, 1 failed, 41 skipped. 7 failures same disposable-target gate; 1 staff-bootstrap failure was flaky and passed when rerun alone. New targeted tests pass. |
| `npm audit` | FAIL (known upstream/dev chain) | 7 high vulnerabilities in Prisma/effect chain; no safe non-breaking fix applied |
| `npm run build` | PASS with disposable migrated DB | `DATABASE_URL=file:/tmp/alaminn-test-szTBmD/test.sqlite JWT_SECRET=<redacted-random> npm run build` succeeded |
| Docker Compose config validation | BLOCKED | `docker: command not found` |
| Docker image build | BLOCKED | Docker CLI unavailable |
| Container startup smoke test | BLOCKED | Docker CLI unavailable |
| Health endpoint test | BLOCKED in container; not run standalone | no Docker/runtime server smoke executed |
| Graceful shutdown test | NOT VERIFIED (integration) | code-level safety-net added; no handle-based drain test |
| Auth route tests | PASS | new auth password-reset/session tests + existing auth tests |
| CSP regression tests | PASS | `tests/lib/proxy-csp.test.ts` |
| Prisma migration test on disposable DB | PARTIAL | SQLite init fixture/migrations used for build DB; full MariaDB migration test not run in sandbox |

## Changed Files (code/docs)

- `.env.example`
- `Dockerfile`
- `README.md`
- `docker-compose.yml`
- `docs/DB-MIGRATION-NOTES-2026-11-24.md`
- `docs/PRODUCTION-HARDENING-REPAIR-REPORT.md`
- `docs/PRODUCTION-VERIFICATION-GUIDE.md`
- `docs/RUNTIME-ENTRYPOINT.md`
- `docs/SECURITY-CSP-AUTH-RATELIMIT.md`
- `next.config.ts`
- `prisma/schema.prisma`
- `server.js`
- `src/app/api/v1/auth/forgot-password/route.ts`
- `src/app/api/v1/auth/login/route.ts`
- `src/app/api/v1/auth/reset-password/route.ts`
- `src/lib/auth/rate-limit.ts`
- `src/lib/load-env.ts`
- `src/proxy.ts`
- `tests/integration/auth-password-reset-session.test.ts`
- `tests/lib/bounded-rate-limit.test.ts`
- `tests/lib/load-env.test.ts`
- `tests/lib/proxy-csp.test.ts`

## Remaining Blockers / Production Risks

- Docker unavailable in sandbox: cannot prove compose config/build/container smoke/health/graceful drain in container.
- `npm audit` reports 7 high Prisma/effect-chain vulnerabilities; fixing may require breaking Prisma upgrade.
- CSP still allows `unsafe-inline`; nonce/hash rollout remains.
- Graceful shutdown cannot guarantee full drain without standalone server handle.
- Rate limiting remains process-local; shared store needed for multi-instance deployments.
- Schema default removal for SQLite may require careful migration on existing DBs; no destructive production migration performed.

## Final Acceptance Statement

I do **not** claim 100% completion. All 9 findings were addressed with code/tests/docs where feasible, but Docker runtime validation, full graceful-drain proof, and audit vulnerability remediation remain blocked or partially verified. Owner approval is required before merge/deploy.

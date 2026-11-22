# ALAMINN Engineering Worklog

> Historical engineering log entries from prior sprints are archived in [`docs/archive/worklog-history.md`](./docs/archive/worklog-history.md).

## 2026-11-22 — Full Repository Remediation, Hardening, and Verification

### Summary of Completed Engineering Remediations

1. **Deployment & Provisioning Hardening (`remote-setup.sh`, `start-prod.sh`, `.gitignore`):**
   - Removed all hardcoded database and bootstrap passwords from `remote-setup.sh`.
   - Enforced `umask 077` and `chmod 600` on `.env` generation and removed `cat .env` secret output.
   - Replaced destructive `sed` schema edits and `prisma db push` with `prisma/schema.mysql.prisma` + `prisma.config.mysql.ts` (MySQL/MariaDB) and `scripts/apply-sqlite-migrations.mjs` (SQLite).
   - Fixed `start-prod.sh` `HOSTNAME` default (`0.0.0.0`) and log prefix (`[start-prod]`).

2. **Webhook Authenticity & Replay Protection (`src/app/api/v1/whatsapp/webhook/route.ts`, `src/app/api/v1/social/webhooks/[platform]/route.ts`):**
   - Enforced HMAC-SHA256 `X-Hub-Signature-256` verification over raw request body bytes using `crypto.timingSafeEqual`.
   - Configured production fail-closed (`503`) behavior when webhook secrets are unconfigured.
   - Added 15-minute timestamp replay window enforcement (`409`) and `messageId` idempotency deduplication.

3. **Higher Study & English Learning Security (`src/lib/higher-study/*`, `src/lib/english-learning/*`, `src/app/api/v1/higher-study/**`, `src/app/api/v1/english-learning/**`):**
   - Replaced hardcoded fallback secrets (`"alaminn-hs-dev"`, `"alaminn-el-dev"`) with fail-closed secret resolution (`resolveHigherStudyReferralSecret`, `resolveEnglishLearningReferralSecret`).
   - Replaced browser-token reuse on `POST /api/v1/higher-study/referral/[code]/confirm` with genuine server-to-server HMAC-SHA256 callback verification over raw body bytes (`signReferralCallback` / `verifyReferralCallback`), terminal/duplicate state rejection (`409`), and expiry rejection (`410`).
   - Hardened `callerWhere()` and `GET /api/v1/higher-study/alerts` so anonymous sessions (`{ sessionId, userId: null }`) cannot read or delete user-owned saved items or alerts.
   - Enforced enrollment session/user ownership, course-lesson membership, test completion score requirements, and status non-regression on `/api/v1/english-learning/progress` and `/api/v1/english-learning/enroll`.

4. **XSS-Safe JSON-LD & React Rendering (`src/lib/json-ld.ts`, `src/app/higher-study/page.tsx`, SEO helpers & pages):**
   - Centralized `safeJsonLdStringify` and `serializeJsonLd` escaping `<`, `>`, `&`, `\u2028`, and `\u2029` across every `<script type="application/ld+json">` tag in the repository.
   - Removed unnecessary `dangerouslySetInnerHTML` on plain-text `HomeSection` titles/descriptions in `src/app/higher-study/page.tsx`.

5. **Cron Session Cleanup, Dual Auth/RBAC & Proxy Hardening (`src/app/api/cron/session-cleanup/route.ts`, `src/proxy.ts`, `src/lib/auth/*`, `src/lib/social/crypto.ts`):**
   - Implemented real database cleanup of expired and inactive-account `StaffSession` rows, expired/exhausted/used `PasswordResetCode` rows, and expired `User.passwordResetToken` values in `/api/cron/session-cleanup`.
   - Removed raw password reset token logging from `POST /api/v1/auth/forgot-password`.
   - Unified `SECURITY_HEADERS` application across all `proxy.ts` responses (including `staffGate` 401/403/redirect responses) and gated all Command Center admin API prefixes (`/api/v1/admin`, `/api/v1/higher-study/admin`, `/api/v1/english-learning/admin`, `/api/v1/meetings/admin`, `/api/v1/whatsapp/admin`).

6. **Portability, CI/CD, AI Gateway & Repository Hygiene:**
   - Replaced hardcoded `/home/z/my-project/...` paths in `src/app/api/uci/audit/route.ts`, `prisma/seed-verified-universities.ts`, `scripts/audit_existing_data.py`, and `scripts/extract_alo_dataset.py` with repository-relative paths and environment overrides.
   - Updated `.github/workflows/*.yml` action versions (`@v4` / `@v5`) and made Prisma migration drift (`exit code 2`) a blocking CI failure.
   - Replaced the broken `require("express")` runtime dependency in `src/lib/ai/api-gateway.ts` with an in-process router and Web `Request`/`Response` handler, fixed wildcard `*` permission checks in `AuthMiddleware`, and removed `"Test Document"` pollution on knowledge queries.
   - Removed redundant `bun.lock` files, unused submodule gitlinks (`.gitmodules`), and stale root scripts/checksums, and normalized tracked file permissions (`644` for non-executables, `755` for executable scripts).

# Production Verification Guide

Run these checks before production promotion (in an environment with required tooling/network access):

## Required environment
- Node/npm matching `.nvmrc` and `package.json` engines.
- Disposable DB for build/prerender checks (`DATABASE_URL=file:/abs/path/db.sqlite`).
- Required secrets: `JWT_SECRET` or `AUTH_SECRET` (>=32 bytes), `SESSION_SECRET` (recommended/required for staff routes), `CRON_SECRET`.

## Commands
```bash
npm ci
npx prisma generate
npm run typecheck
npm run lint
npm test
npm audit
DATABASE_URL="file:/tmp/alaminn-build.sqlite" JWT_SECRET="$(openssl rand -hex 32)" npm run build
```

## Docker/runtime
```bash
docker compose config
docker compose --profile tools run --build --rm migrate
docker compose up -d --build
curl -fsS http://127.0.0.1:3000/api/health/ready
docker compose logs -f app
```

## Graceful shutdown smoke
1. Start container/app.
2. Issue an in-flight request.
3. Send SIGTERM.
4. Verify in-flight request completes or fails within bounded timeout; process exits cleanly.

## Auth/security checks
- Verify login/forgot/reset rate limits return 429 at threshold.
- Verify forgot-password response is non-enumerating.
- Verify reset token is single-use and expires.
- Verify production CSP omits `unsafe-eval`.
- Verify no secrets in logs.

## DB migration safety
- Backup before migration.
- Scan for empty sentinel values in `User.email`, `Contact.email`, `Inquiry.reference`.
- Test migration on disposable DB copy.
- Verify rollback/restore procedure.

# DATABASE MIGRATION GUIDE

Verified 2026-09-30. Complements `docs/database.md` and `docs/backup-restore.md`.

## 1. Current topology

| Environment | Provider | Config |
|---|---|---|
| Development / CI | SQLite (`db/custom.db`) | `DATABASE_URL="file:./db/custom.db"` — see §4 path warning |
| Production | MariaDB/MySQL | `DATABASE_URL="mysql://user:pass@host:3306/db"` (values only in server `.env`, never committed) |

Schema: `prisma/schema.prisma` — **55 models**, SQLite dialect today. Historical migrations: `prisma/migrations/00000000000000_initial` (SQLite) and `00000000000000_mysql_initial` (MySQL).

> **SQLite ≠ MariaDB:** do not assume parity. Type mapping (datetime precision, JSON, enums-as-strings) and DDL behaviour differ. Any provider switch is a reviewed, backed-up, tested migration — not a config edit.

## 2. Safe migration procedure (production)

1. **Announce + freeze** content edits for the window.
2. **Back up:** `npm run db:backup` (or `scripts/backup.sh`) — verify the dump with `scripts/verify-backup.sh`; keep ≥1 pre-migration copy outside the server.
3. **Review the schema diff:** `npx prisma migrate diff --from-url "$PROD_URL" --to-schema-datamodel prisma/schema.prisma --script` — read every statement. Reject destructive changes (DROP/rename without data plan).
4. **Dry-run on staging copy** of the production DB.
5. **Apply:** `npm run db:migrate:deploy` (uses committed migrations; never `db push` on production).
6. **Verify:** `npm run db:verify` + app smoke (`/api/health/deep` admin tier shows migrations + counts).
7. **Rollback:** restore the pre-migration backup (tested path — `npm run db:restore`), or point the app back at the previous release using the old schema if the change is additive-only.

## 3. Rules enforced in this project

- Never run dev seed against production (`db:seed` requires `ADMIN_BOOTSTRAP_PASSWORD` and is upsert-idempotent, but production data changes need explicit approval).
- Every privileged DB-touching admin action writes an audit log.
- Audit/log tables are pruned by retention (`/api/cron/audit-log-prune`, default 365 days, floor 30) — business records are NEVER pruned.
- Indexes on hot paths exist (`@index` in schema: entity lookups, `createdAt`, referral codes).

## 4. SQLite path resolution warning (verified footgun)

`DATABASE_URL="file:./db/custom.db"` resolves **relative to `prisma/`** for the Prisma CLI (push/seed) but the Next.js **standalone server** resolves it differently and can silently create an empty database (symptom: `The table main.Article does not exist`). On SQLite deployments use an **absolute** path:

```
DATABASE_URL="file:/home/<user>/alaminn.info/db/custom.db"
```

Production on MariaDB is unaffected. `.env.example` documents this.

## 5. CI behaviour

`.github/workflows/ci.yml` creates an **ephemeral SQLite DB per run** (`prisma db push` + seed), runs the test suite against it, and never touches production. Migrations are applied to production only via the documented procedure above.

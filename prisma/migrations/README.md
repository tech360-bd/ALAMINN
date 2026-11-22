# Provider-specific migrations

The SQLite/libSQL and MySQL histories are deliberately separate:

- `sqlite/` matches `prisma/schema.prisma` and the default `prisma.config.ts`.
- `mysql/` matches `prisma/schema.mysql.prisma` and `prisma.config.mysql.ts`.

Never point one provider's migration history at the other provider. Never run
`migrate reset` on a database containing real content.

## SQLite / libSQL

```bash
npm run db:migrate:status
npm run db:migrate:deploy
npm run db:seed
```

`DATABASE_URL=file:/absolute/path/preview.db` is supported. The libSQL adapter
also accepts `libsql://` URLs with `DATABASE_AUTH_TOKEN`. Seed only a new preview
or after reviewing the seed script; it is not a production content import.

## MySQL 8 / MariaDB

Use Node 20.19+ (Node 24 LTS recommended), install dependencies on the target
host, and configure `DATABASE_URL` in the environment. Do not commit credentials.

```bash
npx prisma validate --config prisma.config.mysql.ts
npx prisma migrate status --config prisma.config.mysql.ts
npx prisma migrate deploy --config prisma.config.mysql.ts
npx prisma generate --config prisma.config.mysql.ts
npm run build
```

The MySQL baseline contains the historical 25 tables. The additive alignment
migration adds the previously schema-pushed modules and the new feature kits
(27 tables total), plus password-reset columns/indexes. It does not drop data.

**Existing production databases require a staging rehearsal.** Many historical
deployments used `db push`, so their actual columns/indexes may differ from the
baseline. Back up the database, compare `migrate diff --from-url "$DATABASE_URL"
--to-schema-datamodel prisma/schema.mysql.prisma --script` on a staging copy, and
review the SQL before deployment. If the baseline tables already exist but the
migration history is absent, do not blindly run the baseline or mark migrations
as applied. Reconcile the history with a database administrator first.

The MySQL schema and additive SQL were structurally checked in this workspace;
they were **not executed against a live MySQL server here**. Prisma's sandbox
WASM engine supports SQLite only, and native-engine downloads were unavailable.
Run the commands above on the target host, where Prisma can obtain its native
engine, and verify the application against staging before production cutover.

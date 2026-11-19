# Release and database safety

The manual **Deploy (manual approval)** workflow accepts a commit on `main` only
when the quality, MariaDB, and container checks have passed for that commit.
A host operator must provision SSH host-key verification, the PM2 app, and
`$HOME/alaminn/shared/.env` before the workflow can activate a release. Use an
absolute SQLite `file:/…` URL in the shared environment; never store the database
inside a release directory. Set `DEPLOY_DATABASE_PROVIDER` to match the host
(`mysql` by default). Set a strong `CRON_SECRET` for the authenticated write probe.

- **SQLite:** the release takes an online backup and opens it independently for
  an integrity check; keep backups outside the release directory.
- **MariaDB:** the release requires `mariadb` and `mariadb-dump`. Configure
  `BACKUP_VERIFY_DATABASE_URL` for an explicitly provisioned, empty scratch database
  (distinct from production), using a different restricted verifier account.
  Give the scratch database a name beginning with `alaminn_backup_verify_`. The workflow
  restores into scratch, and checks the result before proceeding. Use a fresh scratch
  database for each release; do not point the verifier at another live database.
- The release applies the provider's committed history and requires migration status
  before activating. If the database predates Prisma migration history, stop for
  a reviewed baseline against a restore; do not reset it, fabricate migration
  records, or edit historical migration files.
- Readiness checks database-backed models; an authenticated POST also writes and
  reads test rows in a transaction, rolls back, and confirms the rows are absent.
  The gate also verifies the running process reports the expected release ID.
  Failed activation restores the prior application symlink. The separate rollback
  workflow uses the previous verified artifact, not the currently active one. It does not revert
  schema changes or automatically restore old data over newer writes.
- Before approving a live activation, rehearse against a restored production-like
  copy. After activation confirm public routes, staff and CRM login, access scopes,
  real recovery delivery, UCI review, UMC REST and WebSocket health, error logs, and
  the previous release path. If data recovery is needed, pause writes and obtain a
  separate decision before restoring over any database.

Run isolated API and security tests locally (`npm run test:disposable`) with port
3000 free. Tests that modify accounts require the disposable database marker and
matching application handshake. Do not aim the regression tools at production.

## UCI imports and source approval

`node --import tsx scripts/seed_uci.ts` imports missing data into the explicit
`DATABASE_URL` using the repository dataset (or the `ALO_DATASET` file). It does
not reset existing records or replace human reviews. Discovered URLs require
operator approval: after confirming the source and permission, run
`node --import tsx scripts/approve-uci-source.ts SOURCE_KEY HTTPS_URL 'Permission evidence'`.

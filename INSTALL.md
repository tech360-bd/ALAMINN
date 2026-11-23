# Install Al Aminn Info

Use Node **22.22.3** from `.nvmrc` and its bundled npm. The root install uses
`package-lock.json`. Bun is not required for Next.js, Prisma, or UMC; independent
mini-services may have their own Bun setup.

```bash
nvm install && nvm use
npm ci
cp .env.config.example .env.config
# Generate distinct values with openssl rand -hex 32 for JWT_SECRET, SESSION_SECRET,
# and CRON_SECRET. Set DATABASE_URL=file:./db/custom.db for development.
mkdir -p db
npm run env:check
npm run db:migrate:deploy
npm run db:migrate:status
npm run dev
```

The install generates the SQLite Prisma client. For a MariaDB deployment, use
`npm run db:generate -- mysql` before building, and `npm run db:migrate:deploy --
--config prisma.config.mysql.ts` against the intended MariaDB database. Prisma
migration commands need access to Prisma's schema-engine distribution. Never use
`db push`, `migrate reset`, or seed to repair or upgrade an existing production DB.

## First login

- **Command Center `/admin/login`**: provision the owner via `npm run db:seed` on
  your new development DB with your own `ADMIN_BOOTSTRAP_EMAIL` and
  `ADMIN_BOOTSTRAP_PASSWORD`. The seed creates sample content as well.
- **Staff `/login`**: set `STAFF_BOOTSTRAP_EMAIL`, `STAFF_BOOTSTRAP_NAME`, and
  `STAFF_BOOTSTRAP_PASSWORD` securely in a one-off operator environment, run
  `npm run staff:bootstrap`, then remove the temporary credentials. This command
  works only before any staff exists. The Command Center owner does not grant
  a staff role. Password reset requires a working SMTP delivery configuration.

See [the release runbook](./docs/RELEASE-SAFETY.md) before upgrading a live installation.

## Verify it works

```bash
# Health check
curl http://localhost:3000/api/health
# → {"success":true,"message":"Alaminn.info is operational."}

# Lint
npm run lint
# → 0 errors, 0 warnings

# Tests
npm run test
# → 241 tests pass

# Type check
npm run typecheck
# → 0 errors
```

## Common next steps

- **Add a new admin page**: see DEVELOPMENT.md §20 "Adding a new admin CRUD page"
- **Add a new API route**: see DEVELOPMENT.md §20 "Adding a new public API endpoint"
- **Configure email**: uncomment `SMTP_*` or `RESEND_API_KEY` in `.env`
- **Start mini-services**: see DEVELOPMENT.md §8
- **Deploy to production**: see DEVELOPMENT.md §16

## Need help?

- **Complete guide**: [DEVELOPMENT.md](./DEVELOPMENT.md) — every file, every command, every env var
- **Deployment**: [DEVELOPMENT.md §16](./DEVELOPMENT.md#16-deployment--local-cpanel-docker-pm2-systemd)
- **Troubleshooting**: [DEVELOPMENT.md §19](./DEVELOPMENT.md#19-troubleshooting)

---

**Default admin**: `admin@alaminn.info` / `ChangeMeNow!2024` — change it!

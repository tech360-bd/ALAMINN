# Ops Runbook — `alo-server-lap` rebuild, migration & verification

**Scope:** manual rebuild of the local `alaminn.info` service on `alo-server-lap`
(`100.94.234.101`, host checkout `/home/alamin/alolabs-projects/alaminn.info`)
onto the current `main`, applying the PR #106 university-intelligence schema,
and verifying end-to-end with `scripts/verify-intel-live.js`.

**State this runbook was written against (2026-11-28):**

| Item | State |
| --- | --- |
| GitHub `main` head | `9fff450` (contains PR #106 `5169630`, PR #108 `0596c87`, PR #109 `a00ea3d`, PR #107 `9fff450`) |
| Host checkout | fast-forwarded to `0596c87`; **stale build** still running on `127.0.0.1:3012` (`/api/health` 200, PR #106 routes 404) |
| Host `.env` | present, last modified Nov 24 — predates PR #106 but key names are unchanged (see audit below) |
| `verify-intel-live.js` | previously crashed on hardcoded `/home/z/.npm-global/.../playwright`; fixed in this PR (portable + `--http-only`) |

**Guardrails:** never edit `.env` values in place except adding missing keys;
never drop/recreate the database; migrations are additive and replayed
idempotently; the service on `:3012` stays the single local listener.

---

## 1. Pre-flight (read-only, no changes)

```bash
cd /home/alamin/alolabs-projects/alaminn.info
node --version                        # need >= 18.18 (native fetch used by the verifier)
git fetch origin && git log --oneline -5 origin/main
git status --short                    # record dirty files before any switch
git log --oneline -1                  # local HEAD, expect 0596c87 or newer
ss -ltnp | grep -E ':3012|:3056'      # identify WHICH process owns :3012 (systemd? pm2? bare node?)
systemctl list-units --no-pager | grep -i alaminn || true
pm2 list 2>/dev/null || true
```

Record the `PID`/unit that owns `127.0.0.1:3012` — Step 7 restart command
depends on it. The repo ships `deploy/alaminn-info.service` (systemd,
`PORT=3056`) and `deploy/ecosystem.pm2.cjs` (pm2, `PORT=3056`); a host that
serves `:3012` is running a host-local unit or manual launcher, so **adjust
the unit/launcher name in Step 7 to whatever Step 0 actually found**.

## 2. Backup env + database (never skip)

```bash
mkdir -p backups
cp -p .env "backups/env-backup-$(date +%Y%m%d-%H%M%S)" && chmod 600 backups/env-backup-*
# Detect DATABASE_URL scheme WITHOUT printing secrets (prints only e.g. "mysql" or "file"):
rg -o '^DATABASE_URL=[a-z]+' .env
```

- **SQLite** (`DATABASE_URL=file:...`): copy the DB file itself.
  ```bash
  DB_PATH=$(rg -o '^DATABASE_URL=file:(.*)' -r '$1' .env | head -1)
  sqlite3 "$DB_PATH" ".backup 'backups/db-$(date +%Y%m%d-%H%M%S).sqlite'"
  ```
- **MySQL/MariaDB**: use the project canonical backup (reads `.env` itself,
  no secrets on the command line):
  ```bash
  npm run db:backup        # scripts/release-backup.mjs
  ```
  or a manual consistent dump with credentials sourced from `.env`
  (replace user/pass/db names with the values already in `.env` — do not
  paste them into the shell history):
  ```bash
  mysqldump --single-transaction --routines --triggers <DB_NAME> \
    > "backups/db-$(date +%Y%m%d-%H%M%S).sql"
  ```

Verify the backup exists and is non-trivially sized before continuing.

## 3. Sync code to latest `main`

```bash
git stash push -u -m "pre-sync $(date +%F-%T)" || true   # only if Step 1 showed dirty files
git pull --ff-only origin main
git log --oneline -1
```

If `--ff-only` fails, the local checkout has diverged — stop and reconcile
manually (do not force-push). Note: an old unpushed local commit
`70c5b3e` (gitlink churn + `scripts/verify-wave2-repos.py`) may exist on the
host; its script has been salvaged into `main` by this PR, so the commit can
be dropped: `git reset --hard origin/main` **after** the backups in Step 2.

## 4. Install dependencies + generate Prisma clients

```bash
npm ci                       # or: npm install
npm run db:generate          # scripts/prisma-generate.mjs generate (sqlite client)
node scripts/prisma-generate.mjs generate mysql   # mysql client from prisma/schema.mysql.prisma
node scripts/prisma-generate.mjs validate sqlite
node scripts/prisma-generate.mjs validate mysql
```

## 5. Apply migrations (additive, idempotent — no data loss)

```bash
# SQLite (offline-safe replays prisma/migrations/sqlite in order,
# maintains _prisma_migrations, skips already-applied):
node scripts/apply-sqlite-migrations.mjs            # default db path
# or explicit: node scripts/apply-sqlite-migrations.mjs "$DB_PATH"

# MySQL/MariaDB:
npx prisma migrate deploy --schema prisma/schema.mysql.prisma
npx prisma migrate status --schema prisma/schema.mysql.prisma
```

The PR #106 migration `20261128020000_university_intelligence` (both dialects)
adds the intelligence tables; it must apply cleanly on top of the Nov 24
database. If a migration fails, **stop** — restore from Step 2 backup, capture
the error, and do not hand-edit SQL.

## 6. Build

```bash
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint .
npm run build                # next build -> .next/standalone (+ static/public copied)
```

## 7. Restart the `:3012` service

Pick the case that matches Step 0:

```bash
# (a) systemd host-local unit (replace <unit> with the real name found in Step 0):
sudo systemctl restart <unit> && systemctl status <unit> --no-pager -l

# (b) pm2:
pm2 restart alaminn && pm2 logs alaminn --lines 20

# (c) bare process (last resort; keep PORT/HOSTNAME pinned):
pkill -f '.next/standalone/server.js' || true
PORT=3012 HOSTNAME=127.0.0.1 NODE_ENV=production nohup node .next/standalone/server.js \
  > logs/standalone-3012.log 2>&1 &
```

The standalone server honors `PORT`/`HOSTNAME`; keep the port at `3012` so
nginx/tailscale routing is untouched.

## 8. Verify (the fixed verifier — no Playwright needed)

```bash
curl -sS http://127.0.0.1:3012/api/health

# HTTP engine, zero deps (what previously crashed on the hardcoded path):
node scripts/verify-intel-live.js --http-only --base-url http://127.0.0.1:3012

# Full browser engine against the public site (needs playwright + chromium):
node scripts/verify-intel-live.js --base-url https://alaminn.info

# Repo test suites (optional on the host):
npm run test:unit
npm run security:test
```

Expected: `RESULT: 21 PASS / 0 FAIL of 21 (engine=http, base=http://127.0.0.1:3012)`
with the 10 admin intelligence APIs and `/api/cron/university-intelligence`
returning 401 anonymous (auth-gated, not 404 — 404 means the build predates
PR #106). Exit codes: `0` all pass, `1` route failures, `2` fatal/bad args.

## 9. Rollback (if anything fails after restart)

```bash
# stop service (unit/pm2/pkill per Step 7), then:
git checkout "backups/pre-sync-tag"            # or: git reset --hard 0596c87
npm ci && npm run build && restart service
# DB: restore Step 2 backup
# sqlite: cp backups/db-*.sqlite "$DB_PATH"
# mysql:  mysql <DB_NAME> < backups/db-*.sql
cp backups/env-backup-* .env && chmod 600 .env
```

---

## 10. Env compatibility audit vs `0596c87` (results, names only — no secrets)

Keys read by the PR #106 intelligence code paths
(`src/lib/higher-study/intelligence/*`, `/api/cron/university-intelligence`,
admin intelligence APIs):

| Key | Where used | In `.env.example` | In `.env.production.example` | Notes |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Prisma (both dialects) | yes | yes | required |
| `CRON_SECRET` | `src/lib/cron-auth.ts` (401 gate) | yes | yes | required for cron integration |
| `JWT_SECRET` / `AUTH_SECRET` | admin auth | yes (`JWT_SECRET`) | yes (`AUTH_SECRET`/`NEXTAUTH_SECRET`) | `scripts/check-env.mjs` accepts either; >= 32 bytes |
| `SESSION_SECRET` | admin sessions | yes | yes | recommended |
| `AUDIT_LOG_RETENTION_DAYS` | audit-logger | yes | — | has code default |
| `RESET_CODE_RETENTION_HOURS` | reset flow | yes | — | has code default |
| `HIGHER_STUDY_REFERRAL_SECRET` | referral APIs | yes | — | defaults to `alaminn-hs` in code |
| `NEXT_PUBLIC_SITE_URL` | SEO/links | yes | yes | recommended |
| AI provider keys (`GROQ_API_KEY`, `OPENROUTER_API_KEY`, `OLLAMA_*`, …) | broader AI services | yes | — | optional; not a gate for intelligence routes |

**Conclusion:** every env key the intelligence code reads exists in
`.env.example` (and the critical ones in `.env.production.example`); the Nov 24
host `.env` needs **no renames**, only verify presence of `CRON_SECRET`,
`JWT_SECRET`/`AUTH_SECRET`, `SESSION_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`:

```bash
set -a; . ./.env; set +a; node scripts/check-env.mjs    # prints set/MISSING flags only, never values
```

## 11. CSV ↔ importer/schema audit (results)

**Data:** `data/higher-study/01_universities.csv` — 325 data rows + header,
35 columns; `data/higher-study/02_courses.csv` — 1,508 data rows + header,
42 columns.

**Finding:** nothing in `src/`, `scripts/`, `prisma/`, or `docs/` reads these
CSV files today (`rg "01_universities|02_courses|data/higher-study"` = 0 hits
outside this doc). They are review/staging assets delivered with PR #108, not
an automatic seed. The actual bulk-import path is the admin API
`POST /api/v1/higher-study/admin/intelligence/import`, which accepts JSON rows
(`UniversityImportRow` / `CourseImportRow` from
`src/lib/higher-study/intelligence/importer.ts`) and enforces: L2
`sourceOrgKey` allow-list, ≥ 0.82 name-similarity duplicate skip, `dryRun`
mode, max 5,000 rows / 4 MB, draft + never auto-published.

**Field mapping (CSV → importer row), for a future CSV→JSON adapter:**

| University CSV column | Importer field | Note |
| --- | --- | --- |
| `official_name` | `universityName` | required |
| `city` / `state_region` | `city` | null preserved |
| `official_website_url` | `officialWebsite` | |
| `country_code` | `countrySlug` | must already exist as `higherStudyCountry.slug`; importer errors if unknown, never guesses |
| — | `sourceOrgKey` | must be a defined `L2_DISCOVERY` org (`sources.ts`) |
| `university_external_id` / `slug` | — | app-side slugs are generated by the importer; external IDs need a lookup step |

| Course CSV column | Importer field | Note |
| --- | --- | --- |
| `official_course_title` | `courseTitle` | required |
| `university_external_id` | `universitySlug` | must map to an app university slug (lookup step required) |
| `study_level` | `studyLevel` | defaults to `bachelors` |
| `duration_value`/`duration_unit` | `durationMonths` | needs unit conversion |
| `application_deadline` | `applicationDeadline` | |
| `ielts_*` columns | `ieltsRequirement` | text passthrough |
| course URL column | `officialCourseUrl` | |

**Gap (known, optional follow-up):** a small CSV→JSON adapter + external-ID →
app-slug resolver is needed before bulk import; until then, import via the
admin API with `dryRun: true` and hand-mapped rows. This is deliberately **not**
built in this PR to keep the scope to verifier portability + ops docs.

## 12. Deploy automation note (known pending item)

GitHub Actions deploy automation referencing `tag:github-actions` (Tailscale
OAuth app) previously returned HTTP `400` (see
`docs/UNIVERSITY_INTELLIGENCE_DELIVERY_AND_INCIDENT_REPORT.md`). This runbook
covers the manual path; automated CI deploys remain pending until the Tailscale
OAuth app is fixed in the Tailscale admin console (re-issue the OAuth client
secret, update the repository secret, then re-run the workflow).

# ALAMINN DEPLOYMENT RUNBOOK (AI-OS program)

> **Status:** DRAFT — derived from the existing, proven deployment configuration in this
> repository. It does **not** replace `DEPLOYMENT-GUIDE.md`, `docs/DEPLOYMENT_RUNBOOK.md`,
> `docs/deliverables/ROLLBACK_GUIDE.md`, `DEPLOYMENT-CHECKLIST.md`, or `SERVER-SPEC.md`;
> it records the current baseline topology and adds the runbook sections the AI-OS
> program will need. Rehearsals (backup/restore/rollback) are **not executed** — audit-only
> mode. They are Phase 8 gates.

---

## 1. Service topology (baseline, verified from config)

| Service | Runtime | Port | Process manager | Notes |
|---|---|---|---|---|
| `alaminn` (main app) | Node ≥20 (prod image: Node 22) | **3056** (prod spec) / 3000 (dev & docker-compose) | PM2 (`deploy/ecosystem.pm2.cjs`) or systemd (`deploy/alaminn-info.service`) | Next.js standalone; health `/api/health` |
| `ai-worker` | Bun | — | manual/pm2 (mini-services) | AI task execution |
| `audit-worker` | Bun | — | manual/pm2 | audit processing (own `AUDIT_WORKER_DATABASE_URL`) |
| `email-worker` | Bun | — | manual/pm2 | email queue drain |
| `notification-service` | Bun | — | manual/pm2 | notifications |
| `health-monitor` | Bun | — | manual/pm2 | system health |
| Caddy (dev/sandbox) | Caddy | 81 → localhost:3000 | systemd | `Caddyfile` |
| MySQL (optional) | MySQL 8 | 3306 | cPanel or docker-compose (`db` service) | Dual-schema support |
| Scheduler | cPanel cron / systemd timer | — | — | invokes `/api/cron/*` with `CRON_SECRET` |

**Never change ports (3056/3000/81), the PM2 app name, or the deploy directory layout
without explicit approval** (master rule).

## 2. Deployment paths (baseline)

| Path | Procedure | Evidence |
|---|---|---|
| GitHub Actions → prod | `deploy.yml`: guard (CI green on SHA) → preflight (Tailscale + pinned SSH host key) → build (standalone tarball + SHA256) → transfer → pre-activation checks (DB backup, migration status) → atomic `current` symlink swap → PM2 reload → health check on 3056 → auto-rollback on failure | `.github/workflows/deploy.yml`, `SERVER-SPEC.md` |
| Versioned release | `versioned-release.yml` | `.github/workflows/` |
| Docker | `docker compose up -d --build` (app on 3000; optional MySQL) | `docker-compose.yml` |
| cPanel | `deploy/cpanel/`, `start-prod.sh`, `remote-setup.sh`, `README-CPANEL-NODE.md` | root |

## 3. Environment & secrets

- 68 env keys defined in `.env.example` (names only). Production values live in the server
  env / GitHub Secrets — **never** in the repo.
- Critical: `AUTH_SECRET` (≥32 bytes, refuse-to-start enforced), `CRON_SECRET` (fail-closed),
  `DATABASE_URL`, SMTP/WhatsApp/AI provider keys.
- New AI-OS services will add: service tokens for isolated lane (video/knowledge workers),
  DataForSEO key (Phase 5), optional vector-store config (Phase 4, pending sign-off).

## 4. Standard release procedure (with AI-OS phases)

1. Phase merged to `main` with green CI (`ci.yml`: typecheck · lint · test · security · build).
2. Update `ALAMINN_DATABASE_CHANGELOG.md` **before** any migration ships.
3. If schema changed: rehearse migration on disposable copy → row/constraint parity →
   verify restorable backup (§5) → obtain approval → `db:migrate:deploy` during the
   pre-activation step.
4. Deploy via `deploy.yml` (manual approval). Watch: health check on 3056.
5. Post-deploy verification: `/api/health`, `/api/health/deep`, `/api/readiness`, smoke
   the phase's admin pages, tail audit logs.
6. Record commit SHA + results in `ALAMINN_IMPLEMENTATION_PROGRESS.md`.

## 5. Backup & restore (rehearsal = Phase 8 gate)

| Step | Command/procedure | Status |
|---|---|---|
| Backup | `npm run db:backup` (`scripts/backup-db.ts`); verify `BACKUP_RETENTION_COUNT` rotation | exists — rehearsal pending |
| Verify backup | `npm run db:verify` (`scripts/verify-db.ts`) | exists |
| Restore (disposable) | `npm run db:restore` into a scratch instance (`scripts/restore-db.ts`); run parity checks + smoke queries | rehearsal pending |
| Restore (production) | Only per `docs/deliverables/BACKUP_RESTORE_GUIDE.md` with owner approval | — |
| Experimental-table caution | `AgentOs*` migrations must not be auto-applied to existing DBs (see `docs/AGENTOS_PHASE2_FOUNDATION.md`) | enforced by policy |

## 6. Rollback procedures

| Scenario | Action | Status |
|---|---|---|
| Bad release | PM2 last-known-good release dir + `current` symlink restore (automated in `deploy.yml` on health failure) | configured |
| Bad migration | Restore verified pre-migration backup (§5); never hand-edit rows without approval | rehearse in Phase 8 |
| Audit docs only (current state) | `git checkout 597d5ef9 -- docs/ALAMINN_*.md` | trivial |
| Isolated service failure (video/knowledge) | Stop service; feature-flag the module; main app unaffected by design (queue backs up, no crash) | design invariant |
| Worker failure | Restart worker; lease/attempt bounds prevent duplicate side effects (idempotency keys) | design invariant |

## 7. Monitoring & incident

- Health: `/api/health` (compose healthcheck + deploy check), `/api/health/deep`,
  `/api/readiness`, `SystemHealth` model + health-monitor worker.
- Logs: app logger (`src/lib/logger.ts`), audit logs (admin UI), observability lib.
- Incidents: follow `SECURITY-CHECKLIST.md` for security events; audit-log export for
  forensics (`/api/v1/admin/audit-logs/export`).

## 8. Post-approval additions to this runbook

- Isolated services (RSSHub, video workers) deployment manifests + service-token rotation.
- DataForSEO/voice provider runbooks (Phase 5/7).
- Load/perf test procedure (Phase 8).

---

## 9. Status report (required fields)

| Field | Value |
|---|---|
| **Completed work** | Topology inventory, deployment-path map, env/secrets baseline, release procedure, backup/restore + rollback procedures (drafted from existing config), monitoring map. |
| **Pending work** | All rehearsals (backup/restore/rollback) — Phase 8; isolated-service manifests (Phases 4–7). |
| **Blockers** | Audit-only mode (no runtime actions); rehearsals need approved environment access. |
| **Security concerns** | Migration auto-deploy against live DBs (mitigated by policy), secret rotation for new service tokens (design in security doc). |
| **Files changed** | This document only. |
| **Tests executed** | None (no deployment actions taken). |
| **Test results** | n/a. |
| **Rollback instructions** | Delete/checkout this document. No deployment or server state was touched. |

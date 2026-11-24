# Alaminn.info — Documentation Index

This directory contains the architecture, database, deployment, security, and operational documentation for **Alaminn.info**.

---

## 1. Canonical Stack Overview

| Layer | Technology | Details |
| --- | --- | --- |
| Runtime | **Node.js 22 LTS** (`.nvmrc` -> `22.22.3`) | **npm** (`package-lock.json`) is the single authoritative package manager. |
| Framework | **Next.js 16** (App Router, `output: "standalone"`) | Served via `server.js` (HTTP + Socket.IO Unified Messaging Channel). |
| Language & UI | **TypeScript 5**, **React 19**, **Tailwind CSS 4**, **shadcn/ui** | Strict TypeScript, centralized XSS-safe JSON-LD serialization (`src/lib/json-ld.ts`). |
| Database & ORM | **Prisma 7** | Dual-provider parity: SQLite (`prisma/schema.prisma`, `prisma/migrations/sqlite`) for local/CI and MySQL/MariaDB (`prisma/schema.mysql.prisma`, `prisma/migrations/mysql`) for production. |
| Authentication | **Dual-Domain Auth** (`src/proxy.ts`) | `auth_token` (HS256 JWT, `User` table) for Command Center (`/admin`, `/api/v1/*/admin/*`) and `alo_session` (HMAC-SHA256 + `StaffSession` table) for ALO Staff/UCI/UMC (`/dashboard`, `/console`, `/reports`, `/admin/uci`, `/api/uci/*`, `/api/umc/*`). |

---

## 2. Core Documentation

### Root Guides
- [`../README.md`](../README.md) — Quick start, architecture overview, dual authentication matrix, required environment variables, and migration commands.
- [`../DEVELOPMENT.md`](../DEVELOPMENT.md) — Complete engineering reference.
- [`../INSTALL.md`](../INSTALL.md) — Environment setup and bootstrap instructions.
- [`../DEPLOYMENT-GUIDE.md`](../DEPLOYMENT-GUIDE.md) & [`../DEPLOYMENT-CHECKLIST.md`](../DEPLOYMENT-CHECKLIST.md) — Production deployment procedures (`remote-setup.sh`, `start-prod.sh`, Docker, and GitHub Actions CI/CD).
- [`../SECURITY-CHECKLIST.md`](../SECURITY-CHECKLIST.md) — Security controls, webhook HMAC verification, secret management, and audit gates.
- [`../worklog.md`](../worklog.md) — Current engineering remediation summary.
- [`MASTER_IMPLEMENTATION_BASELINE.md`](./MASTER_IMPLEMENTATION_BASELINE.md) — Repository baseline recorded before the master implementation tranche.
- [`MASTER_IMPLEMENTATION_STATUS.md`](./MASTER_IMPLEMENTATION_STATUS.md) — Truthful, per-stage status register for the master implementation, including blockers.
- [`STAGE_INBOX_CMS_CHAT_PLAN.md`](./STAGE_INBOX_CMS_CHAT_PLAN.md) — Concise implementation plan for the unified inbox, CMS and persistent AI chat stage.
- [`STAGE_INBOX_CMS_CHAT_STATUS.md`](./STAGE_INBOX_CMS_CHAT_STATUS.md) — Nine-section stage report with verification evidence and honest completion percentage.

### `docs/` Reference Documents
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — System architecture and module boundaries.
- [`api.md`](./api.md) — Public, admin, webhook, and cron API conventions.
- [`database.md`](./database.md) — Prisma schema design, SQLite/MySQL parity, and migration workflows.
- [`environment.md`](./environment.md) — Environment variable reference.
- [`security.md`](./security.md) & [`security-report.md`](./security-report.md) — Security architecture, RBAC, and threat mitigations.
- [`deployment.md`](./deployment.md), [`backup-restore.md`](./backup-restore.md), & [`disaster-recovery.md`](./disaster-recovery.md) — Operations, backup verification, and recovery runbooks.
- [`archive/`](./archive/) — Historical audit reports (`FINAL-AUDIT-REPORT*.md`, `FINAL-DELIVERY-REPORT.md`), legacy platform guides, and historical worklog (`worklog-history.md`).

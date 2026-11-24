# Alaminn.info — Executive Authority, Higher Study, English Learning & Command Center Platform

Integrated multi-surface platform for **Al Aminn** (`https://alaminn.info`), combining:

1. **Executive Authority Website (`/`)** — Executive profile, work system, case studies, quantified impact records, projects, insights/articles, schedule-a-meeting flow, and AI advisor.
2. **Higher Study Platform (`/higher-study`)** — Verified universities, courses, scholarships, PhD research, supervisors, destinations, intakes, comparison tools, eligibility checker, saved items, deadline alerts, and ALO Education referral attribution.
3. **English Learning Platform (`/english-learning`)** — IELTS/English courses, lessons, timed practice tests with auto-grading, tutor directory, learner enrollment & progress tracking, and referral attribution.
4. **Command Center Admin Portal (`/admin`)** — CRM (contacts, companies, inquiries, opportunities, meetings, tasks, notes, documents), AI Workspace & human-in-the-loop approvals, Higher Study & English Learning content administration, WhatsApp AI agent dashboard, social inbox/scheduler, audit logs, and RBAC user management.
5. **ALO Education Staff & UCI/UMC Consoles (`/dashboard`, `/console`, `/reports`, `/admin/uci`)** — University Course Intelligence (UCI) verification console, Unified Messaging Channel (UMC), and staff session management.

---

## Technology Stack

| Layer | Technology |
| --- | --- |
| Runtime & Package Manager | **Node.js 22 LTS** (`.nvmrc` -> `22.22.3`) · **npm** (`package-lock.json` is authoritative) |
| Framework | **Next.js 16** (App Router, standalone output, custom `server.js` with Socket.IO UMC integration) |
| Language & Styling | **TypeScript 5** (strict) · **Tailwind CSS 4** · **shadcn/ui** · **Framer Motion 12** |
| ORM & Databases | **Prisma 7** — SQLite (`prisma/schema.prisma`, `prisma.config.ts`) for local/dev/CI; MySQL/MariaDB (`prisma/schema.mysql.prisma`, `prisma.config.mysql.ts`) for production |
| Testing | **Vitest 4** (unit, component, lib, integration, API) + **Playwright** + security verification suite (`scripts/security-tests.ts`) |

---

## Dual Authentication Architecture

The platform intentionally separates executive Command Center administration from ALO Education operational staff accounts. Both systems are enforced at the edge/proxy layer (`src/proxy.ts`) and inside route handlers:

| Dimension | 1. Command Center Auth (`User`) | 2. ALO Staff & UCI/UMC Auth (`StaffAccount`) |
| --- | --- | --- |
| Cookie Name | `auth_token` (`httpOnly`, `SameSite=Lax`, 24h TTL) | `alo_session` (`httpOnly`, `SameSite=Lax`, 7d TTL) |
| Token Mechanism | HS256 JWT (`jose`) via `src/lib/auth/jwt.ts` + DB active-user verification in `src/lib/auth.ts` | HMAC-SHA256 token (`src/lib/auth/token.ts`) + revocable `StaffSession` row in `src/lib/auth/session.ts` |
| Signing Secret | `resolveAuthSecret()` (`JWT_SECRET` -> `AUTH_SECRET`, >= 32 bytes required in production) | `resolveStaffSecret()` (`SESSION_SECRET` -> `JWT_SECRET` -> `AUTH_SECRET`, >= 32 bytes required in production) |
| Roles | `SUPER_ADMIN`, `OWNER`, `EXECUTIVE_ASSISTANT`, `CRM_MANAGER`, `PARTNERSHIP_MANAGER`, `CONTENT_MANAGER`, `MARKETING_MANAGER`, `PROJECT_MANAGER`, `AI_REVIEWER`, `SECURITY_AUDITOR`, `VIEWER` (`src/lib/rbac.ts`) | `ADMIN`, `EDITOR`, `AGENT`, `VIEWER` (`src/lib/auth/rbac.ts`) |
| Protected UI Prefixes | `/admin` and `/admin/*` (except `/admin/uci*` and `/admin/{login,forgot-password,reset-password}`) | `/dashboard`, `/console`, `/reports`, `/admin/uci` |
| Protected API Prefixes | `/api/v1/admin/*`, `/api/v1/higher-study/admin/*`, `/api/v1/english-learning/admin/*`, `/api/v1/meetings/admin`, `/api/v1/whatsapp/admin/*` | `/api/staff/*`, `/api/settings`, `/api/uci/{admin,audit,import,export}`, `/api/umc/*` |

---

## Required Environment Variables

Copy `.env.example` to `.env.config` for local development (canonical). Legacy `.env` is fallback-only. Never commit real secrets.

| Variable | Purpose | Production Requirement |
| --- | --- | --- |
| `DATABASE_URL` | Prisma datasource URL (`file:./db/custom.db` for SQLite or `mysql://...` for MySQL/MariaDB) | Required |
| `JWT_SECRET` / `AUTH_SECRET` | Signing & AES-256-GCM encryption secret for Command Center JWTs and stored integration tokens | Required (>= 32 bytes) |
| `SESSION_SECRET` | Signing secret for ALO Staff `alo_session` tokens and password-reset HMACs | Required (>= 32 bytes) |
| `CRON_SECRET` | Shared secret authenticating `/api/cron/*` and `POST /api/health/ready` | Required (>= 16 chars) |
| `WHATSAPP_WEBHOOK_SECRET` (or `META_APP_SECRET`) | Meta HMAC-SHA256 (`X-Hub-Signature-256`) secret for `/api/v1/whatsapp/webhook` and `/api/v1/social/webhooks/[platform]` | Required for webhook ingestion (endpoints return `503` when unset) |
| `HIGHER_STUDY_REFERRAL_SECRET` | HMAC-SHA256 secret for Higher Study referral tokens and server-to-server `/api/v1/higher-study/referral/[code]/confirm` callbacks | Required in production (>= 32 bytes) |
| `ENGLISH_LEARNING_REFERRAL_SECRET` | HMAC-SHA256 secret for English Learning referral tokens | Required in production (>= 32 bytes) |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | Initial Command Center `OWNER` account bootstrap credentials | Password >= 12 chars when bootstrapping |
| `STAFF_BOOTSTRAP_EMAIL` / `STAFF_BOOTSTRAP_PASSWORD` | Initial ALO `StaffAccount` (`ADMIN`) bootstrap credentials | Password >= 12 chars when bootstrapping |

---

## Local Development Quick Start

```bash
nvm use                            # Node 22.22.3 (.nvmrc)
npm ci                             # Install from package-lock.json & generate Prisma client
mkdir -p db
node scripts/apply-sqlite-migrations.mjs   # Apply all versioned SQLite migrations
npm run db:seed                    # Optional: seed development fixtures
npm run dev                        # Start development server on http://localhost:3000
```

---

## Database Migrations

Both SQLite and MySQL/MariaDB schemas are maintained in lockstep (enforced by `tests/unit/schema-parity.test.ts` and `tests/migrations/client-parity*.mjs`). Never use `prisma db push` in production or CI.

- **Validate both schemas:**
  ```bash
  npm run db:validate
  npm run db:validate -- mysql
  ```
- **SQLite migration deployment:**
  ```bash
  npm run db:migrate:deploy
  # or offline via Node built-in sqlite:
  node scripts/apply-sqlite-migrations.mjs
  ```
- **MySQL / MariaDB migration deployment:**
  ```bash
  npx --no-install prisma migrate deploy --config prisma.config.mysql.ts
  npm run db:generate -- mysql
  ```

---

## Quality Gates & Verification

```bash
npm run typecheck                  # TypeScript strict check (tsc --noEmit)
npm run lint                       # ESLint check
npx vitest run                     # Unit, lib, component, integration & API test suites
npm run build                      # Production Next.js build (standalone output)
```

---

## Documentation Index

- **[`DEVELOPMENT.md`](./DEVELOPMENT.md)** — Comprehensive developer reference (routes, Prisma models, services, and workflows).
- **[`INSTALL.md`](./INSTALL.md)** — Installation, account bootstrap, and worker setup guide.
- **[`DEPLOYMENT-GUIDE.md`](./DEPLOYMENT-GUIDE.md)** & **[`DEPLOYMENT-CHECKLIST.md`](./DEPLOYMENT-CHECKLIST.md)** — Production deployment and release runbooks.
- **[`SECURITY-CHECKLIST.md`](./SECURITY-CHECKLIST.md)** — Security controls, secret hygiene, and verification checklist.
- **[`docs/README.md`](./docs/README.md)** — Structured index of architecture, database, API, and archived historical reports (`docs/archive/`).
- **[`docs/MASTER_IMPLEMENTATION_BASELINE.md`](./docs/MASTER_IMPLEMENTATION_BASELINE.md)** & **[`docs/MASTER_IMPLEMENTATION_STATUS.md`](./docs/MASTER_IMPLEMENTATION_STATUS.md)** — Baseline and honest stage-by-stage status for the AI-command-center implementation program.

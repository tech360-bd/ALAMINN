# ALAMINN BASELINE AUDIT — Phase 0

> **Mode:** AUDIT-ONLY. No dependencies installed, no source modified, no schema changed.
> **Branch:** `arena/f63046ea-alaminn` (from `main` @ `597d5ef9bead270ea0d5b557b61c6d63c9cd7d04`)
> **Audit date:** 2026-11-10
> **Method:** Static inspection of the checked-out tree (`git status`, file reads, pattern
> searches). No runtime was started and no package manager was invoked, per the audit-only
> constraint. Runtime-dependent claims are marked **unverified** and attributed to their
> source document.

---

## 1. Executive summary

`alaminn.info` is **not a prototype**. It is a mature, production-deployed Next.js 16
monolith with:

- **85 Prisma models** (dual schema: SQLite/libSQL default + MySQL variant), 10 migration
  directories.
- **218 API routes** (`src/app/api/**/route.ts`), 13 authenticated `cron` endpoints.
- **66 admin pages** + **73 public pages**, 171 components, 80 library modules.
- A **custom, dependency-free authentication layer** (HMAC-SHA256 signed session cookies,
  scrypt password hashing) with an **11-role RBAC matrix** and `requirePermission()` as the
  single enforcement point.
- An **AI gateway** with a multi-provider model registry (Ollama Cloud + 10+ free-tier
  providers), knowledge retrieval, a workflow executor, and per-task approval records.
- **WhatsApp Cloud API** integration (official Meta API — no web automation), an AI agent
  with intents/knowledge/leads, and deep-link handoff helpers.
- A **social-media pipeline** (adapters, classifier, policy server, publisher, approvals),
  an **email subsystem** (queue + templates + transport), a **kits** system (AI document
  generation), and an **integrations registry** that already enforces
  license-honesty conventions.
- **5 Bun mini-services** (ai-worker, audit-worker, email-worker, health-monitor,
  notification-service) and a GitHub Actions deployment pipeline (manual approval,
  Tailscale-secured SSH, versioned releases with atomic symlink swap + rollback).

**Conclusion:** the target "AI operating system" is roughly 60% *already present in some
form*. The integration mission must extend these modules — not rebuild them. The largest
gaps versus the master specification are: a generalized Agent Registry/Execution Engine
(currently an experimental fixed-contract slice), Memory OS (proposal only), Knowledge OS
(document + chunk models exist; ingestion/search/pipeline incomplete), unified inbox
(channels exist in isolation), and a workflow/automation builder (cron jobs exist; no
visual builder or trigger framework).

---

## 2. Repository identity and Git state

| Field | Value |
|---|---|
| Repository | `tech360-bd/ALAMINN` (checkout at `/home/user/ALAMINN`) |
| Working branch | `arena/f63046ea-alaminn` |
| Base commit | `597d5ef9bead270ea0d5b557b61c6d63c9cd7d04` ("fix(home): restore executive homepage as first section") |
| Working tree at audit start | **clean** (`nothing to commit, working tree clean`) |
| Rollback point | Base commit above; no audit-mode changes to application code. |

---

## 3. Technology stack (verified from manifests)

### 3.1 Core runtime

| Layer | Technology | Evidence |
|---|---|---|
| Framework | Next.js **16.1.x** (App Router, standalone output) | `package.json` |
| UI | React **19**, Radix UI (29 packages), Tailwind CSS **4**, shadcn-style kit (`components.json`), framer-motion, recharts, TanStack Query/Table, zustand | `package.json` |
| Language | TypeScript 5 (`tsconfig.json`, `tsconfig` strict patterns) | `tsconfig.json` |
| Database | **Prisma 6.19.0** with `@prisma/adapter-libsql` (SQLite/libSQL default) + `prisma/schema.mysql.prisma` MySQL variant | `prisma/`, `src/lib/db.ts`, `prisma.config.mysql.ts` |
| Validation | zod 4 | `package.json` |
| Email | nodemailer 9 + react-email 6 + `@react-email/components` | `src/lib/email/` |
| AI SDK | `z-ai-web-dev-sdk` + hand-rolled provider clients | `src/lib/ai/*` |
| Tests | vitest 4 + Testing Library + jsdom; `scripts/security-tests.ts` | `vitest.config.ts`, `tests/` |
| Package locks | **both** `package-lock.json` (npm) and `bun.lock` present — deployment uses `npm ci` (Dockerfile) | root |

### 3.2 AI layer (`src/lib/ai/`, ~7,000 LOC)

| Module | LOC | Role |
|---|---|---|
| `api-gateway.ts` | 535 | Authenticated gateway: RBAC + rate limiting + audit + knowledge retrieval |
| `dashboard-agents.ts` | 1,210 | Domain agent definitions for dashboard tasks |
| `free-providers.ts` / `free-router.ts` / `free-tools.ts` | 3,939 | Multi-provider free-tier routing (Groq, Gemini, Cerebras, Mistral, OpenRouter, SambaNova, SiliconFlow, NVIDIA, Chutes, GitHub Models, Zhipu, HuggingFace, ModelScope…) |
| `inference-engine.ts` | 366 | Local inference abstraction |
| `model-registry.ts` | 281 | Provider/model registry |
| `ollama-cloud.ts` | 604 | Ollama Cloud provider (health/models/usage/agent-model endpoints under `/api/v1/admin/ai-provider/ollama-cloud/*`) |
| `knowledge-retrieval.ts` | 312 | Retrieval service used by gateway + WhatsApp agent |
| `workflow-executor.ts` | 161 | Workflow step executor (early) |

Per-task governance already exists: `AiTask`, `AiApproval` models +
`/api/v1/admin/ai-tasks`, `/api/v1/admin/approvals` routes + `AI_REVIEWER` role.

### 3.3 AgentOS (current state)

- `src/lib/agentos/foundation.ts` (109 LOC): **experimental, isolated** fixed-contract task
  queue over libSQL with an HMAC hash-chained audit log (`AgentOsAudit`), lease tokens,
  bounded retries, deadline enforcement. One deterministic "foundation-status" agent; no
  network/shell/model access. **Not integrated** with the app or production DB
  (`docs/AGENTOS_PHASE2_FOUNDATION.md` states this explicitly).
- Prisma models `AgentOsTask`, `AgentOsApproval`, `AgentOsAudit` exist as placeholders.
- Tests: `tests/unit/agentos-foundation.test.ts`.

### 3.4 Communication

| Channel | State | Evidence |
|---|---|---|
| WhatsApp | **Cloud API** (official Meta) sender + webhook route + AI agent (intents, knowledge base, lead capture) + web-chat handoff | `src/lib/whatsapp/*`, `/api/v1/whatsapp/*` (chat, send, status, webhook, admin/stats) |
| Email | SMTP/Resend transport, queue, templates, email-builder admin, newsletter + campaigns (`EmailCampaign`, `EmailDelivery`) | `src/lib/email/*`, `/api/v1/admin/email-builder/*`, `/api/v1/newsletter/*` |
| Website chat | Live-chat admin + support conversations (`SupportConversation`/`SupportMessage`) | `/api/v1/admin/live-chat/*`, `/api/v1/support/*` |
| Social | Accounts, inbox, publishing, automation rules, approvals, webhooks per platform | `src/lib/social/*`, `/api/v1/admin/social/*`, `/api/v1/social/webhooks/[platform]` |
| Voice/Video/Telegram/Discord | **Not implemented** (integrations registry lists reference projects) | `src/lib/integrations/registry.ts` |

Official WhatsApp number assignment preserved: config single-sourced in
`src/lib/whatsapp/config.ts` (01716609554 / 8801716609554).

### 3.5 Marketing / SEO / content (current state)

- `SeoAudit` model + `/api/v1/admin/seo`, `/api/v1/admin/seo-dashboard` routes; SEO kits in
  `src/lib/kits/seo.ts`.
- Marketing admin module + `SocialCampaign`/`SocialContent` models; content calendar via
  social-scheduler.
- `Document` + `KnowledgeChunk` models (Knowledge OS seed), `src/lib/ai/knowledge-retrieval.ts`.
- Media: `MediaAsset`, media admin, uploads with `src/lib/upload-validation.ts`.
- Video studio admin page exists (`src/app/admin/video-studio`) — feature depth unverified.

### 3.6 Automation (current state)

- 13 `cron` endpoints (backup, email-queue, notification-queue, social-publish,
  session-cleanup, audit-log-prune, temp-cleanup, sitemap-generate, data-verification,
  health-monitor, higher-study-monitor, phd-deadlines, scholarship-deadlines,
  referral-retry) — all guarded by `verifyCronAuth()` (constant-time `CRON_SECRET`, fails
  closed).
- `workflow-executor.ts` early; no trigger framework / visual builder / retry policy engine.

### 3.7 Domain modules (do not disturb)

- **Higher Study**: 30+ models (universities, courses, scholarships, supervisors, research,
  referrals, monitoring/snapshots/data-change tracking), full public + admin surfaces,
  monitoring lib (`src/lib/higher-study/monitoring`).
- **English Learning**: 11 models (courses, lessons, tests, tutors, enrollments, progress,
  referrals), public + admin surfaces.
- **CRM**: contacts, companies, inquiries, opportunities, meetings, notes, tasks, projects,
  articles, case-studies, resources, impact records, newsletter, notifications, settings,
  audit logs, analytics events.

---

## 4. Security baseline (static review)

| Control | Implementation | Assessment |
|---|---|---|
| Authentication | HMAC-SHA256 signed cookie (`alaminn_session`), payload `userId.role.expiresAt`, constant-time verify, HttpOnly/Secure/SameSite, 8h TTL | **Sound.** No NextAuth dependency despite a legacy `NEXTAUTH_URL` env key. |
| Password storage | scrypt (N=16384, r=8, p=1) + per-user salt, constant-time compare | **Sound.** |
| RBAC | 11 roles, `resource.action` permission matrix, `requirePermission()` server-side; 374 permission declarations in `rbac.ts` | **Sound** — client role state never trusted. |
| API guard rails | `src/lib/middleware/auth-middleware.ts`, `rate-limiter.ts`, `audit-logger.ts` | Present; coverage per-route must be re-verified in Phase 8. |
| Cron auth | `CRON_SECRET`, constant-time, fail-closed 503 | **Sound.** |
| Secret handling | 68 env keys centralized via `src/lib/env.ts`; secrets server-side only; `.env.example` contains names only | **Sound** (no secrets in the example file). |
| Uploads | `src/lib/upload-validation.ts` + tests | Present. |
| Audit | `AuditLog` model, audit-logs admin + export, `AgentOsAudit` hash chain (experimental) | Present. |
| Threats flagged for Phase 8 | Prompt injection via knowledge/WhatsApp/RSS content; tool-permission bypass in future AgentOS; cross-tenant leakage once multi-org memory lands; SSRF in future website-ingestion; supply-chain (dual lockfiles) | Documented in `ALAMINN_SECURITY_ARCHITECTURE.md`. |

Prior security artifacts already in-tree (evidence sources, not re-verified here):
`SECURITY-CHECKLIST.md`, `docs/security-report.md`, `scripts/security-tests.ts`,
`docs/audit/SECURITY_AND_BACKUP_STATUS.md`, `docs/CLAIM_REGISTER.md` (38 public claims
governed).

---

## 5. Deployment baseline

| Path | Detail | Evidence |
|---|---|---|
| Production (spec) | PM2 app `alaminn`, port **3056**, host `alo-server-lap` via Tailscale, dir `/home/alamin/alaminn`, domain `https://alaminn.info` | `.github/workflows/deploy.yml`, `SERVER-SPEC.md`, `deploy/ecosystem.pm2.cjs` |
| CI/CD | `ci.yml` (typecheck · lint · test · security · build), `deploy.yml` (manual approval → build tarball + SHA256 → SSH w/ pinned host key → atomic `current` symlink swap → health check → auto-rollback), `versioned-release.yml` | `.github/workflows/` |
| Docker | Multi-stage `Dockerfile` (node:22-alpine, standalone output), `docker-compose.yml` (app + optional MySQL), healthcheck on `/api/health` | root |
| cPanel | `deploy/cpanel/`, `README-CPANEL-NODE.md`, `start-prod.sh`, `remote-setup.sh` | root |
| Caddy | Dev/sandbox reverse proxy `:81 → localhost:3000` | `Caddyfile` |
| Workers | `mini-services/*` (Bun) — ai/audit/email/health/notification | `mini-services/` |
| Health | `/api/health`, `/api/health/deep`, `/api/readiness` | `src/app/api/health*` |

**Ports in play:** 3000 (dev), 3056 (production PM2), 81 (Caddy sandbox proxy).
No audit-mode change is permitted to any of these.

---

## 6. Test baseline

- 24 test files under `tests/` (unit/lib/api/components): auth, rbac, env, email templates,
  feature-kits, integrations, kit-workers, admin-auth, inquiries, health, agentos-foundation,
  ollama-cloud, free-ai-agents, higher-study-monitoring, schema-parity (guards
  `schema.prisma` ↔ `schema.mysql.prisma`), social-policy, upload-validation, utm, workflow
  tests, browser-console regressions.
- `docs/AGENTOS_PHASE2_FOUNDATION.md` records a **352-test full suite pass** in a prior
  work session (2026-11-02 slice) — cited as historical evidence, **not re-run here**
  because audit-only mode forbids dependency installation. Test execution resumes in
  Phase 8 (see `ALAMINN_TEST_REPORT.md`).

---

## 7. Existing documentation inventory (relevant to this program)

The repo already contains mature governance docs this program must **build on, not
duplicate**: `MASTER-SPECIFICATION.md`, `DEVELOPMENT.md`, `docs/ARCHITECTURE.md`,
`docs/SECURITY_ARCHITECTURE.md`, `docs/MEMORY_ARCHITECTURE.md` (proposal — states "not
implemented"), `docs/AGENTOS_PHASE2_FOUNDATION.md` (experimental slice),
`docs/AGENT_SYSTEM.md`, `docs/CLAIM_REGISTER.md`, `docs/ROUTE-INVENTORY.md`,
`docs/audit/*` (5 prior audits), `docs/deliverables/*`, and the `src/lib/integrations/registry.ts`
honesty framework (42 external projects classified
`adapter | service | reference | desktop | unavailable | excluded` with an explicit
no-vendoring rule for GPL/AGPL projects).

**Continuity note:** `docs/MEMORY_ARCHITECTURE.md` says "no supplied 'AI Memory'
repository is currently verified". This audit verifies `akitaonrails/ai-memory`
(exists, MIT, active) — see `ALAMINN_REPOSITORY_AUDIT.md`. The proposal remains valid and
now has a concrete reference implementation.

---

## 8. Baseline vs. master-spec capability map

| Spec capability | Existing coverage | Gap |
|---|---|---|
| A. AI AgentOS | AiTask/AiApproval, dashboard-agents, whatsapp agent, experimental AgentOS foundation | Agent registry, builder, skills/tools registry, MCP integration, execution engine, collaboration, performance monitoring |
| B. Marketing OS | Marketing admin, SEO routes + SeoAudit, social campaigns, kits, email campaigns | Strategy layer, keyword intelligence, backlink analysis, competitor monitoring, CRO, unified analytics |
| C. Communication Hub | WhatsApp Cloud API, email, website chat, social inbox | Unified inbox, Telegram/Discord/voice/video, routing rules, consent mgmt |
| D. Memory OS | Design proposal only | Everything (short/long-term, consolidation, permissions, audit) |
| E. Knowledge OS | Document + KnowledgeChunk models, knowledge-retrieval service, notes, resources | Ingestion (PDF/DOCX/web/RSS), vector/FTS search, knowledge graph, citations, versioning, permission-aware retrieval |
| F. Content Studio | email-builder, kits AI gen, media library, video-studio page | Writing studio, SEO content gen, video/audio production, subtitles, brand templates, publishing workflows |
| G. Automation OS | 13 cron endpoints, workflow-executor (early), social automation rules | Workflow builder, triggers, conditional logic, agent assignment, retries/recovery, execution history UI |
| H. Admin & Monitoring | 66 admin pages, audit logs, system health, observability lib | Command Center aggregation, security dashboard consolidation, real-time monitoring |

---

## 9. Status report (required fields)

| Field | Value |
|---|---|
| **Completed work** | Full static inventory: stack, 85 models, 218 routes, auth/RBAC, AI layer, WhatsApp, social, email, kits, integrations, mini-services, deployment, tests, docs. Capability-gap map (§8). |
| **Pending work** | Phase 1 repository audit (see `ALAMINN_REPOSITORY_AUDIT.md`), Phase 2 architecture docs, runtime verification (blocked by audit-only mode). |
| **Blockers** | None for audit. Runtime/test verification requires `npm ci` — explicitly prohibited until approval. |
| **Security concerns** | None introduced. Pre-existing follow-ups: prompt-injection surface of retrieval pipelines, dual lockfile drift, per-route guard coverage to be proven in Phase 8. |
| **Files changed** | Only this document and the other `docs/ALAMINN_*.md` audit deliverables. **Zero application files modified.** |
| **Tests executed** | None (static audit only; see §6). |
| **Test results** | Historical evidence: 352-test pass recorded 2026-11-02 (`docs/AGENTOS_PHASE2_FOUNDATION.md`). Not reproduced in audit mode. |
| **Rollback instructions** | Audit adds documentation files only. To roll back: `git checkout 597d5ef9 -- docs/ALAMINN_*.md` or delete the files; no database, config, or service state was touched. |

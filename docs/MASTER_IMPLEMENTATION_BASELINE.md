# MASTER IMPLEMENTATION — STAGE 1 BASELINE REPORT

> Audit-only. Created **before** any application, schema, config, or test change for this
> implementation request. Runtime verification results are recorded separately in the final
> report; statements below are from static inspection of the checkout unless marked otherwise.

## 1. Repository identity and Git state

| Field | Value |
|---|---|
| Checkout | `/home/user/ALAMINN` |
| Repository (origin) | `https://github.com/tech360-bd/ALAMINN.git` |
| Production site in request | `https://alaminn.info` (live health check passed on 2026-11-24) |
| Request's stated GitHub repo | `https://github.com/engralaminn-collab/alaminn.info` — **different from origin**. Work stays on this checkout's origin/branch; no remote renaming or force-push. |
| Branch | `arena/ed00ead1-alaminn` |
| Base commit | `7dd1bae2dfc841fa3803044a0a3f420d6b8f8666` |
| Working tree at audit start | clean (`git status --porcelain` empty) |
| Deployment | manual `workflow_dispatch` only (`.github/workflows/deploy.yml`), `environment: production`, PM2 app `alaminn` on port 3056, atomic release activation with automatic rollback on failed health check. **No automatic production deployment in this session.** |

## 2. Stack, data and auth (verified)

- **Node/npm**: Node `v22.22.3`, npm `10.9.8`; `.nvmrc` = `22.22.3`; engines allow `^22.22.3 || ^24`.
- **Framework**: Next.js 16.4.x App Router, standalone output, custom `server.js` for Socket.IO; React 19; TypeScript 5.9 strict; Tailwind 4; shadcn/Radix; Framer Motion; Recharts.
- **Package manager**: npm with authoritative `package-lock.json` (CI uses `npm ci`).
- **ORM/DB**: Prisma 7.10.1 with `@prisma/adapter-libsql` (SQLite default) and MariaDB/MySQL adapter for production; `prisma/schema.prisma` and `prisma/schema.mysql.prisma` (109 models in MySQL schema, 108 in SQLite); versioned SQLite + MySQL migrations; dual-schema parity enforced in CI.
- **Auth**: custom JWT (`jose` HS256, `auth_token` cookie, `src/lib/auth.ts`, `src/proxy.ts`) for Command Center; separate HMAC `alo_session` for ALO staff/UCI/UMC. 11 Command Center roles with server-side `requirePermission()` (`src/lib/rbac.ts`). Proxy gates `/admin*` and all `/api/v1/**/admin*` prefixes, with per-route role checks inside handlers.
- **Validation/error envelope**: zod 4; most APIs return `{ success, message, data, meta, errors }`.
- **Tests/CI**: Vitest 4 (unit/lib/component/integration/API), `scripts/security-tests.ts`, Playwright available; CI gates: schema replay + validation, typecheck, lint, tests, security suite, build, standalone smoke, MariaDB migration persistence, container readiness. CodeQL + supply-chain workflows also present.

## 3. Route/API inventory (verified counts)

| Surface | Count | Notes |
|---|---:|---|
| App pages (`page.tsx`) | 151 | ~70 public/staff + ~66 admin + auth; `/admin` shell + 10 integrated kits present |
| API route handlers (`route.ts`) | 249 | 15 cron endpoints; admin, higher-study, english-learning, social, WhatsApp, UCI/UMC, auth, health |
| Prisma models (SQLite) | 108 | includes `SocialAccount`, `SocialConversation/Message`, `SocialAutomationState`, `KitDocument`, `SeoAudit`, `EmailCampaign`, `SupportConversation`, `AgentOsTask/Approval/Audit`, `Document`, `KnowledgeChunk`, `MeetingRequest`, `AnalyticsEvent`, `AuditLog`, `SystemHealth` |

**Public site inspected**: `/` is the executive homepage (hero, 8 expertise modules, work system, impact, projects, case studies, Ecosystem, AI-governance narrative, newsletter, contact). `/higher-study` is a complete catalogue hub with destinations, universities, courses, scholarships, subjects, intakes, supervisors, research, resources, compare, saved items, eligibility checker, referral flows. Two AI builders already exist: `/higher-study/sop-builder` and `/higher-study/proposal-builder` with `/api/v1/higher-study/{sop,proposal}` queueing queued `AiTask`s. `/api/v1/higher-study/advisor/chat` is a grounded catalogue Q&A endpoint. English-learning platform also exists.

**Admin inspected**: `/admin` renders real DB metrics (inquiries, opportunity value, tasks due, published articles, contacts, pending approvals, newsletter subscribers, 7-day privacy-friendly analytics, audit log) from `/api/v1/admin/dashboard`. Sidebar groups: Overview, Integrated Kits (10), CRM, Content, Higher Study, English Learning, AI & Insights, Social Command, System. Existing AI chat drawer (`DashboardAiAgentBannerAndDrawer`) uses the free-provider router; admin navigation already includes social accounts/inbox/approvals/content/rules and the global `AutomationSwitch` in the topbar.

## 4. Module-by-module baseline against the master prompt

Status legend: **EXISTS** = working code/route/model verified statically; **PARTIAL** = related code exists but the requested capability is incomplete; **GAP** = not found in this checkout.

| Module | Status | Evidence / gap |
|---|---|---|
| A Public Website | EXISTS | Homepage + 15+ public sections, SEO/JSON-LD, sitemap/robots |
| B Higher Study | EXISTS | Full catalogue + tools + admin CRUD; 25+ dedicated routes |
| C AI Services | PARTIAL | SOP/proposal builders + grounded advisor; no unified "AI Services" landing page or the 18-service catalog with per-user document history |
| D Admin Command Center | PARTIAL | Real DB-backed overview and rich sidebar; no consolidated 17-section overview grouping or per-module control surface for the new modules |
| E Social Account Manager | PARTIAL | `SocialAccount` + admin pages/APIs + official Meta/social adapters; multi-brand/permission-expiry lifecycle, reconnect/revoke/test UX and per-account controls incomplete |
| F Communications Inbox | PARTIAL | Social inbox, WhatsApp, email, live chat exist separately; no single cross-channel conversation/contact schema or unified three-panel console |
| G Content Studio | PARTIAL | Humanizer, email builder, video studio, social content, kits; no single brand-voice/guideline-driven studio across all content types |
| H Campaign Manager | PARTIAL | `SocialCampaign`, marketing kit, scheduler; unified calendar + campaign analytics incomplete |
| I Meeting Manager | PARTIAL | `MeetingRequest` + admin meetings; no agenda/summary/action-item/follow-up workflow |
| J AI Workforce | PARTIAL | `AgentOsTask/Approval/Audit`, free-provider agents, 14-role definitions in `dashboard-agents.ts`; no DB-backed 14-agent registry/task/permission/metric layer or on-demand executor |
| K AI Chat | PARTIAL | Admin AI drawer + `/api/v1/admin/ai-agent/chat`; no conversation history/folders/streaming/attachment/export surface |
| L Coding Agent | GAP | No repository-connected coding agent, action-approval workflow, diff review, or GitHub App integration in application code (only deployment/docs references) |
| M AI Provider Gateway | PARTIAL | `src/lib/ai/{api-gateway,free-router,model-registry,ollama-cloud,inference-engine}.ts`, admin health/models/usage endpoints; no unified admin provider registry with priority/cost/rate-limit/fallback controls across all adapters |
| N Knowledge Base | PARTIAL | `Document`/`KnowledgeChunk` + retrieval; no admin upload/chunk/search/access-control console |
| O Website CMS | PARTIAL | DB-backed Articles/Projects/Case Studies/Settings/Media; no page-level CMS with drafts, versions, approvals and scheduling that changes public rendering without deploy |
| P Analytics | PARTIAL | `AnalyticsEvent`, admin analytics dashboards, SEO audit; social/provider/cost metrics not consolidated; `Unavailable` convention not universally applied |
| Q Audit and Security | EXISTS/PARTIAL | `AuditLog`/`AuditEvent`, RBAC, proxy, security suite, encrypted integration tokens; per-role data-ownership and retention/account-deletion workflows are not complete |

## 5. Risk and constraint register

- Production data must be preserved; migrations must be additive/backward-compatible; dual SQLite and MySQL schemas must stay in parity.
- No secrets in the repo; `.env` is ignored; credentials named in the request are **not** to be stored in code/docs.
- External integrations (Meta, LinkedIn, YouTube, TikTok, X, Telegram, Google, GitHub, Ollama, provider APIs) require owner credentials/platform approval; without a successful real connection test they must be reported `AWAITING CREDENTIALS`, never "connected".
- Editing the production database or deploying is out of scope without explicit owner approval.
- Existing 10 integrated kits and all public/admin routes must keep working; changes should be additive and reversible.

## 6. Stage 2 plan (approved-by-code, not deployed)

Work is executed in this repository in increasing order of safety and value, with tests after each change:

1. **Real Command Center overview** — add a DB-backed `/api/v1/admin/command-center` KPI endpoint covering the metrics in §2 that can be derived from existing rows; surface it in `/admin` with `Unavailable` for provider-only metrics.
2. **Higher Study AI Services** — unified `/higher-study/ai-services` landing page plus a zod-validated, permission/ownership-aware, rate-limited API with persistent per-user documents and revision history, backed by the existing free-first AI router; explicit 503 when no provider is configured.
3. **AI provider gateway hardening** — reusable server-side invocation helper with free-first routing, provider failure telemetry and no secret leakage; only registered providers are exposed.
4. **Documentation and verification** — module status register, tests, typecheck/lint/build, truthful final report with statuses from §28.

Items that require new credentials/platform approval (social OAuth, GitHub App, telephony) or a much larger integration (full coding agent sandbox, cross-channel inbox, page-level CMS) are explicitly tracked as not implemented/awaiting rather than hidden behind UI.

## 7. Baseline verification commands (to run after install)

```bash
npm run typecheck
npm run lint
npm test
npm run security:test
npm run build
```

At baseline creation time `node_modules` was absent; `npm ci --no-audit --no-fund` was started. Test/build results are recorded in the final report, not claimed here.

## 8. Rollback

All changes in this implementation stay on branch `arena/ed00ead1-alaminn` and are individually revertible via Git. Database changes are additive migrations with matching SQLite/MySQL schemas; no destructive migration, data deletion, force-push, or production config overwrite is performed. Deployment is never automatic.

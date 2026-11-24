# ALAMINN.INFO MASTER IMPLEMENTATION — STATUS REGISTER

> Companion to `docs/MASTER_IMPLEMENTATION_BASELINE.md`. This register is updated at the end
> of each implementation tranche. Status vocabulary is the one required by the owner:
> `IMPLEMENTED AND TESTED`, `IMPLEMENTED BUT NOT CONNECTED`, `AWAITING CREDENTIALS`,
> `AWAITING PLATFORM APPROVAL`, `NOT IMPLEMENTED`, `BLOCKED`.

## 1. Tranche 1 — completed in this change set

### 1.1 Command Center operations metrics — `IMPLEMENTED AND TESTED`

- New server-side aggregator `src/lib/command-center/metrics.ts` derives every counter from
  existing persisted rows. No provider is contacted and no secret is returned.
- New authenticated API `GET /api/v1/admin/command-center` uses `dashboard.view` RBAC.
- New UI section on `/admin` shows connected/disconnected social accounts, pending
  conversations, unread messages, drafts, pending approvals, scheduled/published/failed
  content, active/failed AI tasks, site content in review, upcoming meetings, provider health
  and system health. Health with no recorded probe is displayed as `unknown`/`Unavailable`,
  never as healthy.
- Unit tests cover health-status precedence and the "no probe → unknown" rule; API test covers
  anonymous rejection.

### 1.2 Higher Study AI Services — `IMPLEMENTED BUT NOT CONNECTED`

- New public page `/higher-study/ai-services` with the required **Higher Study → AI Services**
  navigation item and bilingual (English/Bangla) UI.
- New catalogue `src/lib/higher-study/ai-services.ts` defines all 18 requested services,
  per-service fields, validation, and prompt construction with explicit no-fabrication,
  no-guarantee and no-invented-citation rules.
- New API `GET/POST /api/v1/higher-study/ai-services` with zod validation, in-process rate
  limiting, free-first `runFreeAiRouter` invocation, explicit `503` on provider failure, and
  no client-side key material.
- New private document APIs `GET/DELETE /api/v1/higher-study/ai-services/documents[/[id]]`
  reuse the existing `KitDocument` table with the dedicated kind
  `higher-study-ai-service`, enforce `createdById === session.userId`, and store revision
  metadata. No schema migration was needed.
- UI supports generation, editing inputs, saving (authenticated only), private history,
  revision generation, download and deletion. Anonymous generation works but is explicitly
  not persisted.
- Status is **IMPLEMENTED BUT NOT CONNECTED** because this environment has no configured AI
  provider credentials; real generation must be verified on a deployment with an approved
  provider. Validation, privacy and authorization paths are tested locally.

## 1A. Tranche 2 — completed in this change set

### 1A.1 Human/AI communication controls — `IMPLEMENTED AND TESTED` (social pipeline scope)

- Global modes `HUMAN_OPERATOR`, `AI_ASSISTED`, `AI_AUTONOMOUS` and `PAUSED` are persisted in
  the existing `Setting` table (`communication.mode`).
- `assertAutomationAllowedNow()` — the final automated-send boundary — checks the global mode
  **before** account/rule policy. Paused/human/assisted modes cannot be overridden downstream.
- "Send through connected platform" (`communication.sendThroughPlatform`) is enforced in the
  social inbox reply route: when disabled, replies are stored as internal notes with
  `deliveryStatus: suppressed` and no provider call is made.
- New RBAC API `GET/PUT /api/v1/admin/communication-controls`, admin UI with per-account modes,
  audit logging, and unit/integration tests.
- Scope note: enforcement currently covers the social reply pipeline. WhatsApp, email, live chat
  and telephony keep their own existing controls; a single cross-channel send boundary is still
  a Stage 5 gap.

### 1A.2 AI Provider Gateway administration — `IMPLEMENTED AND TESTED` (scoped)

- New read-only admin page `/admin/ai-providers` surfaces the existing
  `/api/v1/admin/ai-agent/providers` registry: configured/awaiting-credentials state, masked
  keys only, call/success/failure/latency telemetry and preferred provider.
- Zero-call providers are labelled "Awaiting credentials" rather than "connected". No key value
  is rendered in the browser.
- Existing provider configuration writes, encryption and fallback routing are preserved. Cost
  tracking and a unified cross-adapter registry remain Stage 13 gaps.

## 1B. Tranche 3 — Unified Inbox, Website CMS and persistent AI Chat

Detailed nine-section report: `docs/STAGE_INBOX_CMS_CHAT_STATUS.md`.

### 1B.1 Unified Inbox — `IMPLEMENTED AND TESTED` (local/DB scope)

Additive models (`InboxContact`, `InboxConversation`, `InboxMessage`, `InboxAudit`), contact
identity matching, channel/account/thread uniqueness, assignment/read/status/tags, search,
pagination, internal notes, attachment metadata, delivery status, audit history and idempotency.
The global communication mode is enforced at the new unified send boundary; `PAUSED` blocks all
outbound, assisted automation needs approval, and no external adapter fabricates delivery.

### 1B.2 Website CMS — `IMPLEMENTED AND TESTED` (local/DB scope)

`CmsEntry`/`CmsRevision` support pages, articles and posts with SEO, categories/tags, strict
draft → review → approved → published transitions, role-gated publishing, immutable revisions
and draft-only restore. Public `/content/[slug]` renders only published DB rows.

### 1B.3 Persistent AI Chat — `IMPLEMENTED AND TESTED` (local/gateway scope)

Owned conversations/messages, search/rename/archive/delete, SSE streaming, provider/model
selection via the existing gateway, cancellation handling and truthful provider-unavailable
errors. No browser-side key material.

## 2. Stage-by-stage status (master prompt §26)

| Stage | Scope | Status | Notes |
|---|---|---|---|
| 1 | Repository audit and baseline | IMPLEMENTED AND TESTED | `MASTER_IMPLEMENTATION_BASELINE.md` created before any code change; clean base recorded. |
| 2 | Architecture and database plan | IMPLEMENTED AND TESTED | Baseline §6 documents the additive plan; no destructive schema change. |
| 3 | Admin Command Center | IMPLEMENTED AND TESTED | Real DB-backed operations metrics added to `/admin`; existing 10 kits and dashboards preserved. Full 17-section redesign is deliberately deferred. |
| 4 | Social account management | NOT IMPLEMENTED (this tranche) | Existing accounts/APIs preserved; multi-brand lifecycle, token refresh UX and reconnect/revoke flows remain incomplete. |
| 5 | Communications inbox | IMPLEMENTED AND TESTED (local/DB scope) | Cross-channel inbox models/APIs/UI delivered; external channel live sends still awaiting credentials/approval. |
| 6 | Human/AI communication controls | IMPLEMENTED AND TESTED | Four global modes enforced in both the social pipeline and the new unified inbox send boundary. |
| 7 | Content Studio and calendar | NOT IMPLEMENTED (this tranche) | Existing 10 kits, social content and scheduler preserved. |
| 8 | AI Workforce | NOT IMPLEMENTED (this tranche) | Existing AgentOS foundation and free-provider agents preserved; 14-agent DB registry/executor not added. |
| 9 | Admin AI Chat | IMPLEMENTED AND TESTED (scoped) | Persistent owned conversations, streaming, search/rename/archive and truthful errors delivered; folders/export not added. |
| 10 | Connected Coding Agent | BLOCKED | Requires a GitHub App/credentials, an isolated execution sandbox and explicit action-approval UX. No partial agent UI was created. |
| 11 | Website CMS | IMPLEMENTED AND TESTED (scoped) | Database-backed pages/articles/posts, workflow, SEO, revisions/restore and public published rendering delivered; draft preview/scheduling not added. |
| 12 | Higher Study AI Services | IMPLEMENTED BUT NOT CONNECTED | 18 services, public page, API, private storage, revisions and tests delivered. Provider connection pending credentials. |
| 13 | AI Provider Gateway | IMPLEMENTED AND TESTED (scoped) | Provider registry/telemetry plus validated gateway selection for persistent chat; cost controls and live cross-channel adapter verification remain open. |
| 14 | Meeting and Knowledge Base | NOT IMPLEMENTED (this tranche) | Existing `MeetingRequest` admin and `Document`/`KnowledgeChunk` retrieval preserved. |
| 15 | Security and audit | IMPLEMENTED AND TESTED (scoped) | New endpoints are RBAC/ownership protected; no secret written to code or response. Broader role/retention work remains open. |
| 16 | Testing and integration verification | IMPLEMENTED AND TESTED | See §4 for executed commands and results. |
| 17 | Final code review and deployment preparation | IMPLEMENTED AND TESTED (no deploy) | Diff reviewed, additive-only, no production database access, no deploy performed. |

## 3. Files and routes added or changed

### Added

- `docs/MASTER_IMPLEMENTATION_BASELINE.md`, `docs/MASTER_IMPLEMENTATION_STATUS.md`
- `src/lib/command-center/metrics.ts`
- `src/app/api/v1/admin/command-center/route.ts`
- `src/components/admin/command-center-overview.tsx`
- `src/lib/higher-study/ai-services.ts`
- `src/lib/higher-study/ai-services-documents.ts`
- `src/lib/higher-study/ai-services-rate-limit.ts`
- `src/app/api/v1/higher-study/ai-services/route.ts`
- `src/app/api/v1/higher-study/ai-services/documents/route.ts`
- `src/app/api/v1/higher-study/ai-services/documents/[id]/route.ts`
- `src/app/higher-study/ai-services/page.tsx`
- `src/components/higher-study/ai-services-client.tsx`
- `src/lib/social/communication-controls.ts`
- `src/app/api/v1/admin/communication-controls/route.ts`
- `src/app/admin/communication-controls/page.tsx`
- `src/app/admin/ai-providers/page.tsx`
- `tests/lib/higher-study-ai-services.test.ts`, `tests/lib/command-center-metrics.test.ts`
- `tests/lib/communication-controls.test.ts`, `tests/api/communication-controls.test.ts`
- `tests/api/higher-study-ai-services.test.ts`
- `docs/STAGE_INBOX_CMS_CHAT_PLAN.md`, `docs/STAGE_INBOX_CMS_CHAT_STATUS.md`
- `src/lib/inbox/contacts.ts`, `src/lib/inbox/outbound.ts`, `src/lib/inbox/adapters.ts`
- `src/lib/cms/state.ts`, `src/lib/cms/revisions.ts`, `src/lib/ai/chat-providers.ts`
- `src/app/api/v1/admin/inbox/conversations/**`
- `src/app/api/v1/admin/cms/entries/**`
- `src/app/api/v1/admin/ai-chat/conversations/**`
- `src/app/admin/inbox/page.tsx`, `src/app/admin/cms/page.tsx`, `src/app/admin/ai-chat/page.tsx`
- `src/app/content/[slug]/page.tsx`
- `prisma/migrations/{sqlite,mysql}/20261124000000_inbox_cms_chat/migration.sql`
- `src/lib/inbox/ingest.ts`, `src/lib/inbox/attachment-storage.ts`
- `src/app/api/v1/webhooks/inbox/[channel]/route.ts`
- `src/app/api/v1/admin/inbox/attachments/route.ts`, `[id]/route.ts`
- `src/app/api/v1/admin/cms/entries/[id]/preview/route.ts`
- `tests/lib/stage-inbox-cms.test.ts`, `tests/lib/stage-inbox-integrations.test.ts`,
  `tests/unit/stage-inbox-cms-chat-api.test.ts`

### Changed

- `src/app/admin/page.tsx` — mounts the new operations section (additive).
- `src/components/higher-study/higher-study-navbar.tsx` — adds the AI Services navigation item.
- `src/components/admin/admin-shell.tsx` — adds AI Providers and AI Communication Controls nav items.
- `src/lib/social/policy-server.ts` — enforces the global communication mode before account policy.
- `src/app/api/v1/admin/social/inbox/[id]/route.ts` — honours the external-send switch.
- `src/lib/ai/dashboard-agents.ts` — registers dedicated copilots for the new admin pages (required by the existing agent-route parity test).
- `src/components/admin/admin-shell.tsx` — adds Website CMS, Cross-Channel Inbox and AI Chat navigation.

### Database changes

Tranche 3 adds nine additive models to both dual Prisma schemas and additive-only SQLite/MySQL
migrations under `20261124000000_inbox_cms_chat/`. The SQLite migration was applied to a
temporary verification database (`10 recorded/applied, 0 already present, 0 failed`). No
production database, data row or configuration was changed.

## 4. Verification

All commands were executed locally on 2026-11-24 (UTC):

| Command | Result |
|---|---|
| `npm ci --no-audit --no-fund` | PASS — 1,355 packages installed from lockfile |
| `npm run typecheck` | PASS — no TypeScript errors (after Tranche 3 as well) |
| `npm run lint` | PASS — 0 errors, 61 pre-existing warnings; no warnings introduced by this change set |
| `npx vitest run tests/lib/higher-study-ai-services.test.ts tests/lib/command-center-metrics.test.ts` | PASS — 8/8 tests |
| `npx vitest run tests/lib tests/unit tests/components tests/integration` | PASS — 58 files / 648 tests (includes Tranche 3) |
| `npm run test:disposable -- --security` | PASS — 7 API test files / 41 tests; security suite 22/22 |
| `npm run build` (with generated secrets + migrated temporary SQLite DB) | PASS — new Tranche 1–3 routes present in the build manifest; no production DB or config accessed |

Build prerequisite note: `npm run build` requires `DATABASE_URL` and a migrated database because
several Higher Study pages pre-render from the DB. A plain build without those prerequisites
fails for reasons unrelated to this change set; CI already prepares them.

## 5. Environment variable checklist (no values)

Existing `.env.example` already documents provider keys (`OPENROUTER_API_KEY`, `GROQ_API_KEY`,
`GEMINI_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_CLOUD_API_KEY`, …), auth secrets
(`AUTH_SECRET`, `SESSION_SECRET`, `JWT_SECRET`) and webhook secrets. This tranche adds **no new
environment variables**. Future stages will need (names only, no values):
`GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `META_APP_ID`,
`META_APP_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `TELEGRAM_BOT_TOKEN`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ENCRYPTION_KEY`.

## 6. Integrations

- Connected: none newly. No external provider was contacted during implementation.
- Unified inbox adapters use official APIs with declared scopes, refuse fake delivery and
  report `not_connected` until credentials are configured; live delivery is unverified.
- Awaiting credentials: all AI generation providers, social OAuth channels, GitHub App,
  calendar providers, telephony, and every external inbox channel.
- Awaiting platform approval: Facebook/Instagram/LinkedIn/YouTube/TikTok/X app review,
  WhatsApp Business API permissions, GitHub App installation.

## 7. Deployment and rollback

- **No deployment was performed.** Deployment remains a manual, owner-approved workflow
  (`.github/workflows/deploy.yml`, `workflow_dispatch` + `environment: production`).
- Rollback: revert this branch's commits or `git checkout 7dd1bae2dfc841fa3803044a0a3f420d6b8f8666 -- <paths>`.
  No database rollback is required because no migration or data mutation occurred outside
  the disposable test database.

## 8. Remaining blockers

1. AI provider credentials/platform decision for real generation verification.
2. GitHub App credentials and an isolated sandbox before the Coding Agent can be implemented.
3. OAuth app approvals before any social channel can be reported as connected.
4. Owner prioritization for the remaining stages; they were not silently marked complete.
5. Live credentialed provider delivery remains outside the verified scope (adapter code paths
   and failure handling are tested with mocked responses).

## 9. Honest completion percentage (current stage)

See `docs/STAGE_INBOX_CMS_CHAT_STATUS.md` §9: **98% (59 of 60 acceptance criteria fully
evidenced)**. The only uncounted criterion is a real credentialed provider send; unmockable
live verification requires credentials/platform approval. A 100% claim would be false.

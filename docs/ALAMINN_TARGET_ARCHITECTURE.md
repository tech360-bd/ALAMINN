# ALAMINN TARGET ARCHITECTURE — Phase 2

> **Status:** Design only. Nothing in this document exists until a phase implements it.
> Nothing here overwrites `docs/ARCHITECTURE.md` / `docs/MASTER_ARCHITECTURE.md`; it
> extends them with the AI-OS modules and records where those older documents and this
> one agree or diverge.
> Evidence base: `ALAMINN_BASELINE_AUDIT.md`, `ALAMINN_REPOSITORY_AUDIT.md`,
> `ALAMINN_INTEGRATION_PLAN.md`.

---

## 1. Architecture at a glance

```
┌────────────────────────────────────────────────────────────────────────────┐
│                      ALAMINN EXISTING APPLICATION (preserved)              │
│  Next.js 16 App Router · HMAC session auth · 11-role RBAC · Prisma 6.19    │
│  (SQLite/libSQL default + MySQL variant) · AI gateway · WhatsApp Cloud API │
│  Email · Social pipeline · Higher Study · English Learning · CRM · Kits    │
│  mini-services (ai/audit/email/health/notification workers, Bun)           │
└───────────────┬────────────────────────────────────────────────────────────┘
                │  additive modules, same auth/DB/UI conventions
┌───────────────▼────────────────────────────────────────────────────────────┐
│                        INTEGRATED MODULES (new, in-app)                    │
│  AgentOS │ Memory OS │ Knowledge OS │ Marketing OS │ Communication Hub     │
│  Content Studio │ Automation OS │ Command Center / Monitoring / Audit      │
└───────────────┬────────────────────────────────────────────────────────────┘
                │  authenticated, documented interfaces only
┌───────────────▼────────────────────────────────────────────────────────────┐
│                      OPTIONAL ISOLATED SERVICES                           │
│  knowledge-ingest (new worker) │ rsshub (unmodified, AGPL)                 │
│  video-render (hyperframes worker) │ video-mpt (MoneyPrinterTurbo, opt.)   │
└────────────────────────────────────────────────────────────────────────────┘
```

**Rule of placement:** if a capability can live in `src/lib/` + `src/app/api/v1/` it stays
in the monolith. A service is extracted only for runtime reasons (Python/ffmpeg, Chromium
rendering, unmodified AGPL upstreams, GPU inference) — never for "architecture fashion".

---

## 2. Module designs

### 2.1 AI AgentOS (Phase 3)

New namespace `src/lib/agentos/` (extending, not replacing, `foundation.ts`):

| Component | Design | Anchors |
|---|---|---|
| **Agent Registry** | Prisma `Agent` (id, slug, displayName, kind ∈ {marketing, seo, research, content, social, support, communication, education, sales, operations, administration}, profileJson, status, version) | `dashboard-agents.ts` definitions migrate into DB-backed profiles |
| **Agent Profiles & Templates** | `AgentTemplate` (seeded from curated skills: marketingskills, ECC selections, humanizer, diagram-design) | Skills Registry |
| **Skills Registry** | `AgentSkill` (name, version, sourceRepo, license, content md, requiredTools[], riskTier). Import gate: license lane check + review. | `integrations/registry.ts` conventions |
| **Tool Registry** | `AgentTool` (name, kind ∈ {db_query, http_fetch, ai_infer, email, whatsapp, social, file, cron}, permission string, allowList config, rateLimit). Every tool maps to an existing server capability — **no arbitrary shell/URL**. | `free-tools.ts`, `workflow-executor.ts` |
| **MCP Integration** | MCP **client** role: Alaminn exposes its tools via an authenticated MCP endpoint for external agents; internal agents call the same Tool Registry (single source of truth). | open-seo/ruflo MCP contract patterns (REFERENCE) |
| **Execution Engine** | Task queue built on the `foundation.ts` contract (lease tokens, bounded attempts, deadline, HMAC audit chain) generalized: `AgentOsTask` gains agentId, toolCalls[], budget. Worker supervisor reuses `mini-services/ai-worker`. | `foundation.ts`, `AiTask` |
| **Permissions** | Each agent carries an explicit `permissions[]` (RBAC permission strings, subset of `rbac.ts`); tool calls checked against both agent grants and the *acting user's* session. Never "all tools". | `rbac.ts` |
| **Human Approval Workflow** | `AgentOsApproval` promoted from placeholder to control: risky actions (send email/WhatsApp, publish social, delete, external POST) require `AI_REVIEWER`/role decision before execution. | `AiApproval` patterns |
| **Collaboration** | Declarative handoffs (task → task, agent → agent) with claim-once semantics (ai-memory pattern, clean-roomed) | ai-memory REFERENCE |
| **Monitoring & Audit** | Per-agent metrics (tasks, success rate, latency, tokens, tool denials) → Command Center; every mutation writes `AgentOsAudit` hash chain + `AuditLog` | `observability.ts` |

**Context economy (clean-room from context-mode):** tool outputs > N KB are spooled to a
store (DB table `AgentToolOutput`), the model receives a handle + summary; full output
retrievable on demand. Saves tokens and shrinks the injection surface.

### 2.2 Memory OS (Phase 4)

Adopt `docs/MEMORY_ARCHITECTURE.md` as the normative spec (it already defines provenance,
confidence, trust tiers, injection resistance). Add the ai-memory-verified concepts:

| Store | Scope | Isolation key | Notes |
|---|---|---|---|
| `MemoryRecord` (short-term) | conversation/task | userId + orgId + projectId + agentId | TTL default 30d, consolidatable |
| `MemoryFact` (long-term) | user/agent/project | same + classification | promoted via consolidation; supersedes lineage |
| `MemoryHandoff` | agent→agent / session resume | owner + claimOnce | typed protocol |
| `MemoryAudit` | all writes/reads of restricted tier | — | mirrors AgentOsAudit chain style |

Hard rules: retrieval filters by the caller's tenancy **before** ranking; model-generated
content is labeled and cannot self-promote to `verified-primary`; no cross-user leakage
(enforced in the query layer + tests).

### 2.3 Knowledge OS (Phase 4)

Builds on `Document`/`KnowledgeChunk`/`knowledge-retrieval.ts`:

| Capability | Design | Reference |
|---|---|---|
| Ingestion | `KnowledgeIngestJob` → `knowledge-ingest` worker: PDF/DOCX/website/RSS → parse → chunk → (embed) → `KnowledgeChunk` with `sourceUri`, `sourceHash`, `trustTier` | llm_wiki pipeline (clean-room) |
| RSS | RSSHub (unmodified isolated service) as feed factory; Alaminn fetches + taints content | RSSHub ISOLATE |
| Search | FTS (SQLite FTS5 / MySQL FULLTEXT per schema) + optional vector column (Phase 4 sign-off) | — |
| Knowledge graph | `KnowledgeLink` (doc↔doc relations: citation, overlap, type affinity) — later phase slice | llm_wiki 4-signal design |
| Citations | Every AI factual answer from retrieval carries chunk-level source refs (UI: click-through) | "Read Sources Only" concept |
| Versioning | `DocumentVersion` (hash + timestamp + author) | siyuan block/version REFERENCE |
| Permissions | Chunk inherits document ACL; retrieval joins against caller permissions | spec requirement |

### 2.4 Marketing OS (Phase 5)

| Capability | Design | Source |
|---|---|---|
| SEO Intelligence | `SeoKeyword`, `SeoRank`, `SeoBacklink`, `SeoCompetitor`, `SeoSiteAudit` models; DataForSEO adapter (`src/lib/seo/dataforseo.ts`) mapped from open-seo workflows | open-seo ADAPT |
| Skills | Marketing skills imported into Skills Registry; Marketing agents execute them against real data via Tool Registry | marketingskills ADAPT |
| Campaign Manager | Extend `SocialCampaign` + `EmailCampaign` under one `MarketingCampaign` view (no table rewrite) | existing |
| Content Calendar | Unify social-scheduler + email schedule + blog drafts | existing |
| Analytics | Marketing events → existing `AnalyticsEvent` + dashboards (real data only) | existing |

### 2.5 Communication Hub (Phase 6)

Unified `CommConversation` / `CommMessage` **views** over existing channel tables
(WhatsApp, email, support, social inbox) — additive mapping tables, not a data migration.
Routing rules (`CommRoutingRule`), templates (existing email templates + WhatsApp
templates), consent (`CommConsent` per channel), delivery status (already in
`EmailDelivery`, WhatsApp statuses), human handoff (existing web-chat→WhatsApp handoff
token flow), AI suggestions (gateway with retrieval grounding). **WhatsApp stays on the
official Cloud API** with the current number assignments untouched.

### 2.6 Content Studio (Phase 7)

Writing studio (MDX editor already in deps: `@mdxeditor/editor`), SEO content generator
(gateway + humanizer pass), social post generator (existing `src/lib/kits/social.ts`),
brand templates (design tokens from `docs/BRAND-DESIGN-SYSTEM.md`), image assets
(`MediaAsset`), video jobs → isolated hyperframes worker / MoneyPrinterTurbo, voice-over
slot (provider-pluggable; VoiceStudio taxonomy as spec reference), subtitles
(ASR provider or MoneyPrinterTurbo path), content approval (`AiApproval` reuse),
publishing workflows (Automation OS).

### 2.7 Automation OS (Phase 7)

Generalize the cron framework into: `WorkflowDefinition` (trigger ∈ {schedule, webhook,
event, manual}, condition graph, steps ∈ {agent task, human approval, action tool,
delay}), `WorkflowRun` (execution history, retry policy, failure recovery — safe retries
via idempotency keys), notifications via existing Notification service. All runs audited.

---

## 3. Database integration design

- **One primary database** (existing Prisma store). No replacement; no new primary engine.
- New models are namespaced and additive; both schema files updated in lockstep
  (`tests/unit/schema-parity.test.ts`).
- Optional future engines (vector index) require a written purpose + sync strategy before
  introduction (master rule); the fallback design (FTS + brute-force cosine on chunks)
  covers Phase 4 acceptance without any new engine.
- Migration safety: rehearse on disposable copy → verify row/constraint parity → backup →
  separate approval → apply (`docs/DATABASE-MIGRATION-GUIDE.md`).

## 4. Service boundaries

| Boundary | Rule |
|---|---|
| Monolith ↔ isolated services | Authenticated HTTP (service tokens stored in env), documented API, job queue for long work |
| Workers ↔ DB | Only the existing approved worker pattern (app-owned DB access layer) — foreign services never write DB directly |
| Agents ↔ tools | Tool Registry allow-list; per-agent grants; rate limits; approval gates for risky actions |
| Retrieval ↔ content | Taint labels (`trustTier`) survive into prompts; policy: retrieved text is data, never instructions |

## 5. Security model (summary)

Full treatment: `ALAMINN_SECURITY_ARCHITECTURE.md`. Core invariants:

1. Existing session auth + RBAC is the only identity plane; agents act with an explicit
   acting-user context (no ambient authority).
2. Every new route enforces `requirePermission()`; new permission strings extend `rbac.ts`.
3. Tool execution is allow-list + approval + audit; no shell, no arbitrary URL fetch (SSRF
   allow-lists), no secret egress to models.
4. Memory/knowledge retrieval is permission-filtered at query time; prompt-injection
   taint labels + "instructions-only-from-system" policy.
5. Isolated services: internal network, service tokens, egress allow-lists where feasible.

## 6. Dependency & migration strategy

See `ALAMINN_DEPENDENCY_MATRIX.md` (what may be installed, when, with what license/audit
gates) and `ALAMINN_INTEGRATION_PLAN.md` §6 (migration strategy). Summary: Phase 3 needs
no new dependencies; only `hyperframes` is a planned runtime import from the register;
everything else is content or isolated.

## 7. Divergence notes vs. older docs

| Older doc | Note |
|---|---|
| `docs/MEMORY_ARCHITECTURE.md` | Stays normative; "unverified AI-Memory repo" note superseded by audit entry #10 (akitaonrails/ai-memory, MIT) |
| `docs/AGENTOS_PHASE2_FOUNDATION.md` | Experimental slice becomes the seed of the Phase 3 execution engine; its warnings (no sandbox, no multi-tenancy) are honored — those features are designed here but gated on tests |
| `docs/MASTER_ARCHITECTURE.md` / `docs/ARCHITECTURE.md` | Unchanged; this doc adds the AI-OS module layer on top |

## 8. Status report (required fields)

| Field | Value |
|---|---|
| **Completed work** | Target architecture for all 8 modules; DB integration design; service boundaries; security model summary; divergence register. |
| **Pending work** | Owner approval; Phase 3 schema/API/UI implementation. |
| **Blockers** | Approval gate. Vector-engine decision deferred to Phase 4 sign-off. |
| **Security concerns** | Cross-tenant memory leakage (designed controls + tests), prompt injection via ingestion, tool bypass (registry + grants), service-token custody. |
| **Files changed** | This document only (plus companion docs). |
| **Tests executed** | n/a (design). |
| **Test results** | n/a. |
| **Rollback instructions** | Delete/checkout this document. |

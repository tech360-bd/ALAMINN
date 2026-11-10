# ALAMINN INTEGRATION PLAN — Phase 2

> **Mode:** PLAN ONLY — no application changes authorized yet. This document is the
> implementation plan presented for approval, as required by the execution rules.
> Evidence base: `ALAMINN_BASELINE_AUDIT.md` (existing system) and
> `ALAMINN_REPOSITORY_AUDIT.md` (27 external repositories).
> Companion docs: `ALAMINN_TARGET_ARCHITECTURE.md`, `ALAMINN_SECURITY_ARCHITECTURE.md`,
> `ALAMINN_DEPENDENCY_MATRIX.md`.

---

## 1. Integration principles (non-negotiable)

1. **Extend, never replace.** New capability lands *inside* the existing Next.js app
   (`src/app/admin/*`, `src/app/api/v1/*`, `src/lib/*`) using existing auth, RBAC, Prisma
   and UI conventions. No second application, no second database as primary store.
2. **Registry consistency.** Every external project is recorded in the existing
   `src/lib/integrations/registry.ts` taxonomy
   (`adapter | service | reference | desktop | unavailable | excluded`) — the decisions in
   this plan map onto it 1:1 (ADAPT→adapter+library, ISOLATE→service, REFERENCE→reference,
   REJECT→excluded).
3. **License lanes are hard walls.** AGPL/GPL/ELv2/LGPL sources never enter the codebase.
   Unlicensed sources never enter the codebase. MIT/Apache sources enter only with
   attribution/NOTICE and code review.
4. **One phase at a time, small commits, evidence before claims.** A feature is "done"
   only with schema + migration + API + RBAC + UI + tests + audit log (see `ALAMINN_TEST_REPORT.md` gates).
5. **Existing services stay up.** WhatsApp number assignments, existing routes, existing
   tables, production port 3056 and deploy pipeline are untouched until separately approved.

---

## 2. Evidence-backed integration priority matrix

Priority = (capability-gap size × strategic value) ÷ (license risk + integration complexity + runtime cost).
"Gap" references the baseline capability map (BASELINE §8).

### P1 — Foundations first (Phases 3–5 enablers)

| Item | Source | Decision | Target module | Evidence for priority | Complexity | Depends on |
|---|---|---|---|---|---|---|
| Marketing skills corpus | marketingskills (MIT) | ADAPT | Marketing OS Skills Registry | Pure content, zero runtime risk, directly fills "Marketing Skills" requirement; repo active 2026-11-10 | Low | AgentOS Skills Registry (P1) |
| Humanizer quality skill | humanizer (MIT) | ADAPT | Content Studio | Content-only, instant win for AI-content quality gate | Low | Skills Registry |
| SEO workflows + DataForSEO mapping | open-seo (MIT) | ADAPT | SEO Intelligence | Fills the largest Marketing-OS gap (keyword/backlink/audit/competitor); MIT; self-hostable fallback exists | Medium | AI gateway, Integrations |
| Memory OS design patterns | ai-memory (MIT) | ADAPT (patterns) | Memory OS | Best verified match for spec D; upgrades `docs/MEMORY_ARCHITECTURE.md` from proposal to designed system | Medium | DB design (Phase 4) |
| Diagram generation skill | diagram-design (MIT) | ADAPT | Content Studio / docs tooling | MIT skill content; useful for architecture deliverables + client assets | Low | Skills Registry |
| AgentOS core: registry + tools + permissions + execution + approvals | *in-house* (extends `src/lib/agentos/foundation.ts`, `AiTask`/`AiApproval`, RBAC) | BUILD | AI AgentOS | The enabling layer for everything else; experimental slice + governance models already exist in-repo | High | — |

### P2 — Capability expansion (Phases 5–7)

| Item | Source | Decision | Target module | Evidence for priority | Complexity | Depends on |
|---|---|---|---|---|---|---|
| Video from template (HTML→MP4) | hyperframes (Apache-2.0) | ADAPT (npm lib) / ISOLATE (worker) | Content Studio | Apache-2.0, Node ≥22 npm package, agent-oriented; matches brand-template video | Medium | Content Studio jobs |
| Short-video production | MoneyPrinterTurbo (MIT) | ISOLATE | Content Studio | MIT; Python/ffmpeg runtime ⇒ isolated service lane; fills "Video Production" | Medium | Isolated-service auth bridge |
| RSS ingestion factory | RSSHub (AGPL, unmodified) | ISOLATE | Knowledge OS | Fills "RSS Ingestion"; unmodified upstream container keeps AGPL clean | Low-Med | Knowledge OS ingestion |
| Selected agent skills pack | ECC (MIT) | ADAPT (curated) | AgentOS Skills Registry | 314 MIT skills; curated import expands agent capability fast | Medium | Skills Registry + permission model |
| Knowledge ingest pipeline design | llm_wiki (GPL) | REFERENCE (clean-room) | Knowledge OS | Best blueprint for ingest queue/source traceability/citations | High | Knowledge OS (Phase 4) |
| Context economy (tool-output spooling) | context-mode (ELv2) | REFERENCE (clean-room) | AgentOS execution engine | Large AI-cost win concept; ELv2 blocks source reuse | Medium | Execution engine |

### P3 — Optional / gated (Phase 7–8 or later)

| Item | Source | Decision | Target module | Gate |
|---|---|---|---|---|
| Context-database architecture | OpenViking (AGPL) | REFERENCE (ISOLATE unmodified only with legal approval) | Memory/Knowledge OS | Legal sign-off |
| Voice pipeline taxonomy | VoiceStudio (AGPL) | REFERENCE (ISOLATE with legal approval) | Content Studio voice-over | Legal sign-off + consent controls (deepfake policy) |
| Block-model/versioning design | siyuan (AGPL) | REFERENCE | Knowledge OS | — |
| Workspace/plugin API design | PI-Desktop (LGPL) | REFERENCE | AgentOS Tool Registry | — |
| Orchestration/memory-federation patterns | ruflo (MIT root) | REFERENCE (+ per-component sweep before any copy) | AgentOS collaboration | Provenance review |
| Marketplace review-gate process | claude-plugins-community (Apache) | REFERENCE | Skills/Tools Registry governance | — |
| Plugin manifest schema | cursor/plugins (**unlicensed**) | REFERENCE (clean-room shapes only) | Tool Registry | Strict zero-copy |
| Integrations catalog seed | public-apis (MIT) | REFERENCE (data import) | Integrations page | Per-entry vetting |
| Study-abroad UX taxonomy | studytra (**unlicensed**) | REFERENCE (UX notes only) | Higher Study UX | Strict zero-copy |

### REJECT (recorded, zero action)

omarchy (OS distro), OpenLogi (device drivers), CloddsBot (trading/keys risk),
vphone-cli (iOS virtualization), fmt (C++), EducationConsultancyWebsite (unlicensed Figma
bundle), NextStep-Abroad (unlicensed demo).

---

## 3. Phase mapping (implementation order after approval)

| Phase | Deliverable | External inputs used | Existing modules touched (additive only) |
|---|---|---|---|
| **3 — AgentOS Foundation** | Agent Registry, Agent Profiles/Templates, Skills Registry, Tool Registry (permission-scoped), Execution Engine (queue → foundation.ts lineage), Human Approval Workflow (extend `AiApproval`), Agent Audit (extend `AgentOsAudit` hash chain), Monitoring | ECC/marketingskills/diagram-design/humanizer skills (content); ruflo/PI-Desktop/cursor-plugins patterns (design) | `src/lib/agentos/*`, `/api/v1/admin/agents/*` (new), admin nav |
| **4 — Memory & Knowledge OS** | Memory models (user/agent/task/project scopes + isolation), consolidation + expiry, search; Document ingestion (PDF/DOCX/web/RSS), KnowledgeChunk pipeline, vector+FTS search, citations, permission-aware retrieval | ai-memory patterns; llm_wiki pipeline design (clean-room); RSSHub (isolated service); OpenViking/siyuan (design refs) | `Document`/`KnowledgeChunk` models, `knowledge-retrieval.ts`, new ingestion workers in `mini-services/` |
| **5 — Marketing OS** | SEO Intelligence (keywords/audits/competitors/backlinks via DataForSEO adapter), Campaign Manager (extend social + email campaigns), Content Calendar, Marketing Analytics | open-seo workflows; marketingskills corpus | `SeoAudit`, `EmailCampaign`, `SocialCampaign`, `/api/v1/admin/seo*` |
| **6 — Communication Hub** | Unified Inbox (WhatsApp + email + web chat + social DMs), routing rules, AI suggestions, human handoff, consent mgmt, templates, delivery status, analytics | CloddsBot channel taxonomy (concept only) | `src/lib/whatsapp/*`, `src/lib/email/*`, live-chat, social inbox models |
| **7 — Content Studio & Automation** | Writing studio + SEO content generator (humanizer pass), video jobs (hyperframes/MoneyPrinterTurbo), voice-over slot, subtitles, brand templates, publishing workflows; Workflow Builder (triggers, conditions, agent assignment, approvals, retries, history) | hyperframes, MoneyPrinterTurbo, humanizer; VoiceStudio taxonomy (ref) | `AiTask`, kits (`src/lib/kits/*`), cron framework → trigger engine |
| **8 — Production Verification** | Regression/security/integration/perf tests, backup/restore rehearsal, rollback rehearsal, deploy verification | — | all |

---

## 4. Target module → existing-anchor map

| New capability | Anchors in the existing system (do not duplicate) |
|---|---|
| Agent Registry / Profiles | `AiTask`, `dashboard-agents.ts`, WhatsApp `agent.ts` (patterns) |
| Skills / Tool Registry | `src/lib/kits/*`, `free-tools.ts`, `integrations/registry.ts` (taxonomy), ECC skill layout |
| Execution Engine / Queue | `agentos/foundation.ts` (lease, retry, hash-chain audit), `mini-services/ai-worker`, `AiTask` |
| Approvals | `AiApproval`, `AgentOsApproval`, `/api/v1/admin/approvals`, `AI_REVIEWER` role |
| Memory OS | `docs/MEMORY_ARCHITECTURE.md` (adopt as the spec), `AgentOsAudit` integrity pattern |
| Knowledge OS | `Document`, `KnowledgeChunk`, `knowledge-retrieval.ts`, `SocialKnowledgeSource` |
| Marketing OS | `SeoAudit`, `EmailCampaign`/`EmailDelivery`, `SocialCampaign`/`SocialContent`, `utm.ts`, analytics events |
| Communication Hub | WhatsApp Cloud API stack, `src/lib/email`, support/live-chat, social inbox |
| Content Studio | email-builder, kits AI, `MediaAsset`, video-studio page |
| Automation OS | 13 cron endpoints + `verifyCronAuth`, `workflow-executor.ts`, `SocialAutomationRule` |
| Admin/Navigation | existing sidebar (Command Center, admin/* pages) — merge, never fork |

---

## 5. Isolated services lane (authenticated interfaces only)

| Service | Tech | Purpose | Contract | Auth |
|---|---|---|---|---|
| `knowledge-ingest` (new, in `mini-services/`) | Bun/Node | PDF/DOCX/web parsing, chunking, embedding | internal job queue → DB writes via app API | existing mini-service conventions |
| `rsshub` (upstream, unmodified) | Node/Docker | RSS feed factory | HTTP feeds | internal network + allow-list |
| `video-render` (hyperframes worker) | Node | HTML→MP4 jobs | job API | service token + approvals |
| `video-mpt` (MoneyPrinterTurbo, optional) | Python | short-video jobs | REST (its API) | service token + approvals |
| `ai-worker` (existing) | Bun | AI task execution | existing | existing |

Rule: **every** call from these services into Alaminn goes through authenticated,
documented interfaces; no direct DB writes from foreign services except the existing
approved worker pattern.

---

## 6. Data & migration strategy

- All new state lands in **new Prisma models** (namespaced `Agent*`, `Memory*`,
  `Knowledge*`, `Marketing*`, `Comm*`, `Workflow*`) — no alterations to existing tables
  beyond additive nullable columns if unavoidable (each one logged in
  `ALAMINN_DATABASE_CHANGELOG.md`).
- Dual-schema discipline continues: every model added to **both** `schema.prisma` and
  `schema.mysql.prisma`, guarded by the existing `tests/unit/schema-parity.test.ts`.
- Migrations follow the existing safety procedure (`docs/DATABASE-MIGRATION-GUIDE.md`,
  `AGENTOS_PHASE2_FOUNDATION.md` gates): disposable-copy rehearsal, backup verified,
  separate approval before applying to any live DB.
- Vector search: start with the existing `KnowledgeChunk` + full-text/LIKE retrieval;
  embedding column/extension decision is deferred to Phase 4 design sign-off (documented
  purpose + sync strategy required by the master rules before any new storage engine).

---

## 7. Dependency plan (summary — detail in `ALAMINN_DEPENDENCY_MATRIX.md`)

- **No new top-level runtime dependencies required for Phase 3** (skills are content).
- Phase 4: PDF/DOCX parsers + embedding client — each evaluated at install time with
  `npm audit` + license check.
- Phase 7: `hyperframes` (Apache-2.0) as the only planned npm runtime import from the
  27-repo register.
- Everything else runs out-of-process (isolated services) or as content.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope explosion across 8 phases | Strict phase gating; one approval per phase; P1/P2/P3 matrix above |
| License contamination | Hard lanes (§1.3); integration registry entries required before any code import; zero-copy for 7 restricted/unlicensed projects |
| AGPL service pressure (RSSHub/VoiceStudio/OpenViking) | Unmodified upstream only; internal network; legal gate; never fork |
| Regression of production features | Additive-only changes; existing 352-test suite + Phase 8 regression gates; rollback points per commit |
| AI prompt injection via ingested content | Security architecture controls (taint labels, permission-aware retrieval, tool permission boundaries) |
| Fake metrics / overclaiming | `docs/CLAIM_REGISTER.md` governance applies to all new dashboards |
| Dual lockfile drift (npm + bun) | Deployment uses `npm ci`; mini-services use bun — document per-package; no cross-drift |

---

## 9. Proposed implementation sequence (awaiting approval)

1. **Approval checkpoint (now):** approve this plan → Phase 3 begins.
2. Phase 3 (AgentOS Foundation) — ~1 reviewable series of commits: schema → registries →
   execution engine wiring → approvals → admin UI → tests.
3. Phase 4 (Memory & Knowledge OS) — schema + ingest worker + search + citations.
4. Phase 5 (Marketing OS) — SEO adapter + skills import + campaign/calendar upgrades.
5. Phase 6 (Communication Hub) — unified inbox + routing + consent.
6. Phase 7 (Content Studio & Automation) — content pipelines + workflow builder.
7. Phase 8 (Production Verification) — full test matrix, backup/restore/rollback rehearsals.

Each phase ends with: updated `ALAMINN_IMPLEMENTATION_PROGRESS.md`,
`ALAMINN_DATABASE_CHANGELOG.md`, `ALAMINN_TEST_REPORT.md` evidence, and a go/no-go note.

---

## 10. Status report (required fields)

| Field | Value |
|---|---|
| **Completed work** | Evidence-backed priority matrix (§2), phase mapping (§3), anchor map (§4), isolated-services lane (§5), migration/dependency strategy (§6–7), risk register (§8). |
| **Pending work** | Explicit owner approval of this plan; then Phase 3 implementation. |
| **Blockers** | **Awaiting approval** per the execution rules — no application changes until then. |
| **Security concerns** | License contamination (mitigated by lanes), prompt injection via future ingestion, service-token design for isolated lane (specified in `ALAMINN_SECURITY_ARCHITECTURE.md`). |
| **Files changed** | This document + companion audit docs only. |
| **Tests executed** | None required for planning; see `ALAMINN_TEST_REPORT.md` for the Phase 8 matrix. |
| **Test results** | n/a (plan document). |
| **Rollback instructions** | Delete/checkout this document; no system state changed. |

# ALAMINN DATABASE CHANGELOG

> **Status:** AUDIT-ONLY baseline. **Zero schema changes have been made.** This log exists
> so that every future migration is recorded with evidence, review and rollback steps, as
> required by the master execution rules. Schema work begins only after plan approval and
> only one phase at a time.
> Related: `docs/DATABASE-MIGRATION-GUIDE.md`, `docs/audit/DATABASE_AND_MIGRATION_REVIEW.md`,
> `prisma/migrations/README.md`.

---

## 0. Baseline (2026-11-10)

| Field | Value |
|---|---|
| ORM | Prisma 6.19.0 |
| Primary schema | `prisma/schema.prisma` — **85 models**, SQLite/libSQL default (`@prisma/adapter-libsql`) |
| MySQL variant | `prisma/schema.mysql.prisma` — parity enforced by `tests/unit/schema-parity.test.ts` |
| Migrations | `prisma/migrations/sqlite/` × 6, `prisma/migrations/mysql/` × 4 + `00000000000000_mysql_initial` |
| Un-applied experimental slice | `AgentOsTask`, `AgentOsApproval`, `AgentOsAudit` migrations exist in-tree; per `docs/AGENTOS_PHASE2_FOUNDATION.md` **not applied to any existing database**; applying requires the migration safety procedure + separate approval |
| Audit-mode changes | **NONE** |

### Baseline model families (for reference)

`User/Contact/Organization/Inquiry/Opportunity/Partnership/StudentReferral/Task/Note/
NewsletterSubscriber/Project/Article/Resource/ImpactRecord/CaseStudy/AiTask/AiApproval/
AuditLog/SystemHealth/MeetingRequest/AnalyticsEvent/Document/KnowledgeChunk/Notification/
Setting/MediaAsset` · HigherStudy* (30+) · EnglishLearning* (11) · Social* (13) ·
`KitDocument/SeoAudit/EmailCampaign/EmailDelivery/SupportConversation/SupportMessage` ·
`AgentOs*` (3, experimental).

---

## Change log (future entries appended here)

Format per entry: **date · phase · change · migration id · evidence · rollback**.

| Date | Phase | Change | Migration | Evidence (tests) | Rollback |
|---|---|---|---|---|---|
| _(none yet)_ | — | — | — | — | — |

### Planned (not executed) — see `ALAMINN_TARGET_ARCHITECTURE.md`

| Phase | Planned models (namespaced, additive) |
|---|---|
| 3 — AgentOS | `Agent`, `AgentTemplate`, `AgentSkill`, `AgentTool`, `AgentToolGrant`, `AgentToolOutput`, `AgentOsTask` (extends experimental), `AgentOsApproval` (promote placeholder), `AgentOsAudit` (keep) |
| 4 — Memory/Knowledge | `MemoryRecord`, `MemoryFact`, `MemoryHandoff`, `MemoryAudit`, `KnowledgeIngestJob`, `KnowledgeLink`, `DocumentVersion`, optional embedding column (pending sign-off) |
| 5 — Marketing | `SeoKeyword`, `SeoRank`, `SeoBacklink`, `SeoCompetitor`, `SeoSiteAudit`, `MarketingCampaign` (view-level union) |
| 6 — Communication | `CommConversation`, `CommMessage` (mapping views), `CommRoutingRule`, `CommConsent`, `CommTemplate` |
| 7 — Automation | `WorkflowDefinition`, `WorkflowRun`, `WorkflowStepRun`, `WorkflowRetry` |

Rules for every future entry:
1. Add to **both** schema files; schema-parity test must pass.
2. Rehearse on a disposable copy; compare rows/constraints.
3. Verify restorable backup before apply (see `ALAMINN_DEPLOYMENT_RUNBOOK.md` §5).
4. Separate approval for applying to any live DB (existing DBs only).
5. Rollback instructions written **before** the migration is applied.

---

## Status report (required fields)

| Field | Value |
|---|---|
| **Completed work** | Baseline schema inventory; changelog process established; planned-model map recorded. |
| **Pending work** | Phase 3+ schema design and migrations (after approval). |
| **Blockers** | Approval gate; experimental AgentOs migrations require the documented safety procedure before touching existing DBs. |
| **Security concerns** | Applying in-tree experimental migrations without review is the top DB risk (flagged in `AGENTOS_PHASE2_FOUNDATION.md`); migration deploy scripts must never run unattended against live DBs. |
| **Files changed** | This document only. |
| **Tests executed** | None (no schema change). |
| **Test results** | n/a. |
| **Rollback instructions** | Delete/checkout this document. No DB state was created, read, or modified during this audit. |

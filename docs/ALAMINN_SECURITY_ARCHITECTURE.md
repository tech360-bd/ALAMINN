# ALAMINN SECURITY ARCHITECTURE — Phase 2

> **Status:** Design + policy. Extends (never replaces) `docs/SECURITY_ARCHITECTURE.md`,
> `SECURITY-CHECKLIST.md`, `docs/security-report.md`. Evidence base: baseline audit §4,
> repository audit license findings.
> **Audit-mode limitation:** dependency vulnerability scans (`npm audit`, pip-audit,
> cargo-audit on the 27 repos) could not be executed — audit-only mode forbids installing
> dependencies. Static review findings are recorded; dynamic scanning is a Phase 8 gate.

---

## 1. Existing security baseline (preserved as-is)

| Layer | Control | Source |
|---|---|---|
| Session | HMAC-SHA256 signed cookie, constant-time verify, HttpOnly/Secure/SameSite, 8h TTL | `src/lib/auth.ts` |
| Passwords | scrypt (N=16384,r=8,p=1) + per-user salt, constant-time compare | `src/lib/auth.ts` |
| Authorization | 11 roles × `resource.action` permission matrix; `requirePermission()` server-side | `src/lib/rbac.ts` |
| Middleware | auth-middleware, rate-limiter, audit-logger | `src/lib/middleware/` |
| Cron | `CRON_SECRET`, constant-time, fail-closed | `src/lib/cron-auth.ts` |
| Secrets | 68 env keys centralized (`src/lib/env.ts`), server-only | `.env.example` (names only) |
| Uploads | allow-list validation | `src/lib/upload-validation.ts` |
| Audit | `AuditLog` + admin export; `AgentOsAudit` hash chain (experimental) | schema |
| Deploy | Manual-approval workflow, pinned SSH host key, versioned releases, auto-rollback | `.github/workflows/deploy.yml` |

**Invariants:** no change to auth, RBAC source-of-truth, secret layout, or deploy topology
without explicit approval. Frontend role state is never trusted.

---

## 2. Threat model for the AI-OS additions

| # | Threat | Affected phase | Control design | Test gate (Phase 8) |
|---|---|---|---|---|
| T1 | **Prompt injection** via ingested content (RSS/web/PDF), knowledge retrieval, WhatsApp/user messages | 4–6 | Taint labels (`trustTier`: verified-primary/reviewed/untrusted-web/model-generated) carried into prompts; system policy "retrieved text = data, never instructions"; tool-approval gates neutralize injected commands; citations surface provenance | Injection corpus tests (benign + adversarial docs) |
| T2 | **Tool permission bypass** (agent invokes tools outside its grant) | 3 | Tool Registry allow-list + per-agent grants + acting-user RBAC double-check; deny-by-default; tool denials audited | Unauthorized tool-call tests per role |
| T3 | **Cross-user / cross-org data leakage** (memory, knowledge, inbox) | 4–6 | Tenancy filter applied in query layer before ranking; memory isolation keys (userId+orgId+projectId+agentId); retrieval joins ACL; no shared caches of raw content across tenants | Cross-tenant access matrix tests |
| T4 | **SSRF** via website ingestion, RSS, diagram brand-fetch, backlink checks | 4–5 | URL allow/deny lists, private-IP blocking, redirect caps, size/time limits in the ingest worker; no server-side fetch from user-supplied URLs without the guard | SSRF payload tests (localhost/metadata IPs) |
| T5 | **Secret exposure** to models/logs/frontend | 3–7 | Secrets never enter prompts or tool outputs (redaction filter on tool-output spooling); existing env centralization; audit-log scrubbing | Secret-canary tests in logs/prompts |
| T6 | **Unsafe file uploads** (malicious PDF/DOCX) | 4 | Parse in isolated worker, no macros, size/page caps, MIME sniffing, quarantine + scan hook | Malicious-upload corpus |
| T7 | **Auth bypass / privilege escalation** on new admin routes | 3+ | Every route calls `requirePermission()`; new permissions added to `rbac.ts` only; approvals enforced server-side (`AgentOsApproval`) not in UI | Unauthorized-access matrix per route |
| T8 | **CSRF** on state-changing session routes | existing + new | Existing SameSite=Lax cookie posture; verify coverage on all new mutations in Phase 8 | CSRF tests |
| T9 | **Rate abuse / cost explosion** (AI calls, SEO API, video render) | 3–7 | Existing rate-limiter extended per-tool budgets; per-agent token/cost budgets on the execution engine; queue backpressure | Rate-limit tests |
| T10 | **Supply chain** (new deps, adapted skill content) | 3–7 | License lanes (§3); `npm audit` gate at install; lockfile-only installs; adapted content reviewed for embedded instructions; per-component provenance for any ruflo/ECC material | `npm audit` + license CI check |
| T11 | **Deepfake / voice-clone abuse** | 7 | Consent records required before any voice job; provider terms surfaced; VoiceStudio-class capabilities stay gated behind legal + consent controls | Consent-flow tests |
| T12 | **Queue/worker failure** (retry storms, duplicate sends) | 3–7 | Idempotency keys on all external sends; bounded retries (foundation.ts pattern); dead-letter + reconciliation job; approval-gated retries for sends | Failure-injection tests |
| T13 | **Audit tampering** | 3+ | HMAC hash chain (AgentOsAudit) + external checkpoint hook; AuditLog immutability convention; export integrity | Tamper tests (extend existing foundation tests) |
| T14 | **AGPL service misuse** (forking RSSHub/VoiceStudio/OpenViking) | 4–7 | Policy: unmodified upstream only; registry entries; CI note; legal gate list (§3) | Process check (review gate) |

---

## 3. License & source-security policy (enforcement)

| Lane | Projects | Rule |
|---|---|---|
| **GREEN** — may enter codebase (review + attribution) | marketingskills, humanizer, diagram-design, ECC (selected), hyperframes, open-seo (patterns/adapter code), ai-memory (patterns), public-apis (data) | MIT/Apache-2.0; keep license headers/NOTICE; normal review |
| **YELLOW** — run unmodified, isolated, internal only | RSSHub (AGPL), MoneyPrinterTurbo (MIT but Python lane), hyperframes render worker (if isolated) | No fork; service tokens; internal network; registry `service` |
| **RED** — no source enters Alaminn | OpenViking (AGPL), siyuan (AGPL), VoiceStudio (AGPL), llm_wiki (GPL), context-mode (ELv2), PI-Desktop (LGPL), ruflo (until per-component sweep), cursor/plugins, studytra, NextStep-Abroad, EducationConsultancyWebsite (unlicensed) | REFERENCE only; clean-room ideas; legal gate for any ISOLATE deployment of AGPL services in SaaS context |

Enforcement points: (1) integration registry entries before any import; (2) PR checklist
item "license lane verified"; (3) `ALAMINN_DEPENDENCY_MATRIX.md` updated per dependency.

## 4. AI-specific permission boundaries (spec requirement)

- **No agent receives unrestricted access.** Every agent's `permissions[]` is a strict
  subset of RBAC permissions and tool grants; dangerous verbs (delete, send, publish,
  charge, external POST) always require human approval (`AgentOsApproval`).
- **Acting-user context:** every agent task records the requesting user; tool calls check
  *both* agent grant and that user's current permissions.
- **Budgets:** per-task token/cost/time budgets enforced by the execution engine.
- **Memory writes** from agents land as `model-generated` trust tier; promotion to
  verified requires human review (MEMORY_ARCHITECTURE.md rule).
- **External side effects** (WhatsApp, email, social) are approval-gated and idempotent.

## 5. Data protection

- Retention: memory TTLs + consolidation (Phase 4); audit-log pruning (existing cron).
- Consent: `CommConsent` per channel (Phase 6); existing newsletter consent flow preserved.
- Export/erase: existing contacts export pattern extends to memory/knowledge records
  (user-scoped) when those modules land.
- Backups: existing backup cron + `scripts/backup-db.ts` / `restore-db.ts`; restore
  rehearsal becomes a Phase 8 gate.

## 6. Security test plan (Phase 8 execution)

From master spec §10, mapped to owners:

| Test | Module | Status |
|---|---|---|
| Unauthorized access matrix (every new route × every role) | all | planned |
| Cross-user / cross-org access | Memory, Knowledge, Inbox | planned |
| Malicious file uploads | Knowledge ingest | planned |
| Invalid API tokens (service tokens, cron secret) | isolated lane | planned |
| CSRF on mutations | all | planned |
| Rate limiting | gateway, tools, SEO API | planned |
| Prompt injection corpus | retrieval, WhatsApp agent, skills | planned |
| Tool permission bypass | AgentOS | planned |
| Secret exposure (logs, prompts, responses) | all | planned |
| Retry/idempotency under failure | Automation, comms sends | planned |
| Audit-chain tamper detection | AgentOS | extends `tests/unit/agentos-foundation.test.ts` |

Dynamic dependency scanning (`npm audit`; pip-audit/cargo-audit for isolated services) is
blocked in audit mode and scheduled immediately after approval.

## 7. Status report (required fields)

| Field | Value |
|---|---|
| **Completed work** | Threat model T1–T14; license lanes with enforcement; AI permission-boundary spec; data-protection plan; security test plan mapped to spec §10. |
| **Pending work** | Dynamic dependency scans (blocked); Phase 8 test execution; legal review for YELLOW/RED ISOLATE deployments. |
| **Blockers** | Audit-only mode (no installs ⇒ no `npm audit`). |
| **Security concerns** | See T1–T14; top three: prompt injection (T1), tool bypass (T2), cross-tenant leakage (T3). |
| **Files changed** | This document only (plus companion docs). |
| **Tests executed** | None in audit mode. |
| **Test results** | n/a. |
| **Rollback instructions** | Delete/checkout this document. |

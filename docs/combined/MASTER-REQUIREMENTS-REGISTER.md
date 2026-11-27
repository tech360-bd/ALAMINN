# Requirements register — initial triage, NOT a complete decomposition

Status meanings follow the request: PASS requires executed acceptance evidence; PARTIAL, BLOCKED, FAIL, NOT VERIFIED otherwise. The following stable IDs cover major work streams and every supplied finding, **not every individual sentence/acceptance criterion**. Complete atomic decomposition and traceability remain outstanding; no percentage or zero-omission claim is justified. Evidence and details are in `SECURITY-FINDINGS-REMEDIATION.md` and `IMPLEMENTATION-STATUS.md`.

| ID | Module | Requirement | Priority | Existing status | Implementation / tests | Status | Dependency / next action |
|---|---|---|---|---|---|---|---|
| SEC-01 | Auth | Admin/staff session revocation on reset/logout | P0 | DB-backed admin and staff sessions | `src/lib/auth.ts`, `src/lib/auth/session.ts`, `tests/api/admin-session-revocation.test.ts` | PARTIAL | Verify MySQL and race/rollback cases, audit every route family |
| SEC-02 | Proxy | Trusted client identity and shared limits | P0 | Unsafe forwarded header trust | `deploy/nginx-alaminn-info.conf`, `src/lib/auth/ratelimit.ts` | NOT VERIFIED | Trusted topology and shared store; multi-instance test |
| SEC-03 | PWA | Private pages and tokens never cached | P0 | Unsafe navigation cache | `public/sw.js` | PARTIAL | See security remediation |
| SEC-04 | Auth | Atomically consume reset token and revoke sessions | P0 | Conditional update and session deletion in one transaction | `src/app/api/v1/auth/reset-password/route.ts` | PARTIAL | MySQL, rollback and reset/login race tests |
| SEC-05 | WhatsApp | Normalize Bangladesh/international numbers correctly | P0 | Defective local conversion | `src/lib/whatsapp/config.ts` | PARTIAL | See security remediation; real provider test blocked |
| SEC-06 | CRM | Exact, isolated and ambiguity-safe contact matching | P0 | Partial substring matching | `src/lib/whatsapp/leads.ts` | PARTIAL | Ownership design and existing data reconciliation |
| SEC-07 | AI | Bounded and shared public rate limiter | P1 | Process-local unbounded map | `src/lib/higher-study/ai-services-rate-limit.ts` | PARTIAL | Shared limiter and proxy identity required |
| SEC-08 | UCI | Filter before pagination, accurate totals | P1 | Filter before page selection | `src/app/api/uci/institutions/route.ts`, `tests/integration/uci-directory-pagination.test.ts` | PARTIAL | MySQL, concurrency and performance validation |
| SEC-09 | Auth | Consistent password policy and bcrypt byte safety | P0 | Common 72-byte bcrypt cap for new passwords | `src/lib/auth/password-policy.ts`, `src/app/api/v1/admin/users` | PARTIAL | Endpoint tests and existing legacy hash risk handling |
| SEC-10 | Inquiry | Disposable success, relationship and rollback tests | P1 | Rejection tests | `tests/api/inquiries.test.ts` | NOT VERIFIED | Real disposable database tests |
| SEC-11 | Deployment | Reconcile proxy, service and test docs | P1 | Port/docs mismatch | `Caddyfile`, `deploy/alaminn-info.service`, `tests/README.md` | NOT VERIFIED | Runtime, TLS and actual topology require owner access |
| GOV-01 | Governance | Complete atomic requirement register, matrix and omission report | P0 | This register is a partial inventory | `docs/combined/` | PARTIAL | Decompose entire prompt into independently testable requirements |
| AUD-01 | Audit | Source, data, deployment, feature and security baselines | P0 | Static repository inspection started | `docs/combined/REPOSITORY-AUDIT.md` | PARTIAL | Production data/logs and comprehensive inspection not available |
| MAYA-01 | MAYA | Dedicated identity, context, permissions and persistent assistant | P0 | No named implementation found | `src/lib/agentos`, `src/lib/ai` | NOT VERIFIED | Design, implementation and isolation tests |
| MAYA-02 | Memory | Owned, sourced, versioned memory, search, export and deletion | P0 | Existing modules not audited against spec | `src/lib/agentos` | NOT VERIFIED | Schema, migration, privacy and runtime tests |
| MAYA-03 | Network | People, organizations, relationships, citations, tasks and promises | P1 | Existing CRM not fully mapped | `src/lib/crm` | NOT VERIFIED | Map and extend existing models |
| MAYA-04 | Learning | Authorized ingestion, retrieval, skill approval and sandbox | P1 | Not established | `src/lib/agentos` | NOT VERIFIED | Threat model and isolated execution |
| JARA-01 | Jara | Stable, unique permanent AI identity and lifecycle | P0 | No named implementation found | No equivalent confirmed | NOT VERIFIED | Account architecture, safe migrations, seed and tests |
| JARA-02 | Jara | Dedicated permissions, history, private/group boundaries | P0 | No named implementation found | `mini-services/messaging-channel` | NOT VERIFIED | Authorization and message integration |
| JARA-03 | Avatar | Approved reference, approval, versioning and rollback | P0 | Reference absent in workspace | No approved asset found | BLOCKED | Owner must provide approved reference image |
| JARA-04 | Messaging | Real direct/group messaging, consent, SMS and audit | P0 | Existing messaging not assessed as Jara | `mini-services/messaging-channel`, `src/lib/sms` | NOT VERIFIED | Provider configuration and end-to-end tests |
| JARA-05 | Calls | Real audio/video sessions and permissions | P0 | No Jara media implementation verified | No equivalent confirmed | NOT VERIFIED | Media architecture, STUN/TURN and browser tests |
| JARA-06 | AI | Bangla/English/Banglish, configured providers and fallback | P1 | Existing provider infrastructure | `src/lib/ai` | NOT VERIFIED | Configured models and real inference tests |
| MOD-01 | Models | Capability-aware, extensible local-first model/provider registry | P1 | Existing AI provider modules | `src/lib/ai` | NOT VERIFIED | Capability and real provider tests |
| CON-01 | Connectors | SDK, OAuth, encrypted credentials, webhooks and actual provider operations | P1 | Existing integration modules | `src/lib/integrations`, `src/lib/social` | NOT VERIFIED | Provider access and tests |
| UI-01 | Control center | Integrate real backend controls for all requested areas | P1 | Existing admin areas | `src/app/admin` | NOT VERIFIED | Underlying functionality and permissions |
| DATA-01 | Data | Ownership, non-destructive migrations, backup/restore | P0 | Dual schemas and migrations | `prisma/`, `deploy/` | BLOCKED | Owner must provide staging and approved data access for production evidence |
| SAFE-01 | Security | Threat model, CSRF, SSRF, uploads, prompt injection, sandbox and auditing | P0 | Existing controls not exhaustively assessed | `src/lib`, `src/app/api` | NOT VERIFIED | Comprehensive threat model and security tests |
| OPS-01 | Infrastructure | CPU, GPU, multi-node and offline profiles | P1 | Existing deployment configurations | `deploy/`, `docker-compose.yml` | NOT VERIFIED | Hardware and infrastructure decisions |
| OPS-02 | Reliability | Durable jobs, retries, idempotency, monitoring and restore | P1 | Existing automation/workers | `mini-services/`, `src/lib/automation` | NOT VERIFIED | Runtime and failure tests |
| REF-01 | References | Inspect all listed references and licenses; paginate topic | P2 | Not inspected | No source integration | NOT VERIFIED | Network availability and full source/license review |
| TEST-01 | Testing | Complete requirement test matrix and evidence | P0 | Existing tests; matrix incomplete | `tests/`, `docs/combined/` | PARTIAL | Acceptance test and runtime execution |
| DEP-01 | Production | Staging, TLS, backup, rollback and approved live verification | P0 | No live environment accessible | `deploy/` | BLOCKED | Owner must provide authorized staging/production access and approve production changes |

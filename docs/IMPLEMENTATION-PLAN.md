# IMPLEMENTATION PLAN — ALAMINN.INFO

Baseline: Phase-Zero audit of 2026-09-30 (`docs/CURRENT-STATE-AUDIT.md`). Principles: preserve working modules, evidence-based status only, no fabricated content, no destructive DB changes, production stays available.

## Phase 1 — Verification re-run (DONE)

All quality gates re-executed and recorded in `CURRENT-STATE-AUDIT.md` §5. Historical results reproduced or improved: 241/241 tests (was 234+7 skip), 22/22 security, 0 type/lint errors, build 291 routes (was 221).

## Phase 2 — Repository hygiene fixes (DONE this session)

| Item | Change | Acceptance |
|---|---|---|
| Missing `.gitignore` | Added (deps, env, DBs, builds, storage runtime) | `git status` clean with node_modules/.env/db present |
| Google Fonts build dependency | Self-hosted OFL fonts via `next/font/local` | `npm run build` succeeds offline |
| SQLite URL footgun | `.env.example` clarified; deployment docs note | Docs + example consistent |
| Storage dirs | `.gitkeep` for logs/temporary/uploads | Fresh clone boots |

## Phase 3 — Branding site polish (scoped)

Site already implements all required sections. Remaining polish (non-destructive):
1. Verify homepage section order matches the brand spec; fix any regressions. **Status: verified via live fetch — no changes required.**
2. ICLA Global Academy: represented inside ecosystem content; a dedicated `/ecosystem/icla-global-academy` page is possible **only with owner-supplied verified copy** — do NOT invent. *Blocked on content.*
3. Lighthouse measurement (needs full browser environment; report actuals only).

## Phase 4 — Higher Study & English Learning regression (DONE)

Referral flow, directory pages, compare, saved, auth, admin rejection — all verified locally (dev + standalone) and key pages on production. Tests: 241 passing incl. inquiries/auth/rbac. No destructive migrations; schema untouched.

## Phase 5 — Command Center completion (scoped, this session)

1. Media upload hardening: extend `api/v1/admin/uploads` with magic-byte validation + dimension checks where missing. **Implement + test.**
2. Audit-log retention: add pruning to existing cron pattern (retention window configurable, default 365 days). **Implement + test.**
3. AI assistant live execution: **blocked** — needs a provider credential from the owner. Approval-gate architecture already exists and is preserved.

## Phase 6 — Integrations (mostly blocked; documented)

| Workstream | State | Exact blocker → next action |
|---|---|---|
| Telegram bot | Not implemented | Owner must create bot via @BotFather, supply token + approved admin chat IDs → then implement webhook + secret + command parser (design already documented in `docs/TELEGRAM-INTEGRATION.md`) |
| Social publishing | Not implemented | Owner must register Meta/LinkedIn/X apps and grant tokens → implement per-platform publishers with the draft→review→approve→schedule→publish→verify pipeline |
| n8n | Not implementable here | No n8n instance/credentials; webhook contract documented in `docs/N8N-WORKFLOW-GUIDE.md` |
| Bilingual i18n | Foundation documented | Structural i18n is a sizeable change to working routes; owner must supply approved Bangla copy. `next-intl` stays installed for a future, reviewable PR. |

## Phase 7 — Security & DB hardening (this session)

1. Re-run 22-test security suite (PASS).
2. Upload hardening (Phase 5 item 1).
3. Audit-log retention pruning (Phase 5 item 2).
4. CSP nonce hardening: evaluated; deferred — current inline RSC payloads require `unsafe-inline`; a nonce migration needs a dedicated reviewed PR. Documented in `SECURITY-CHECKLIST.md`.

## Phase 8 — CI/CD (DONE on this branch)

`.github/workflows/ci.yml`: lockfile install → typecheck → lint → vitest → security suite → production build → artifact validation, on push/PR to this branch.
`.github/workflows/deploy.yml`: manual-approval gated; requires owner-set secrets (`DEPLOY_HOST/USER/SSH_KEY/PORT`); health-check + rollback.

## Phase 9 — DNS/domain (VERIFIED LIVE; residual checks for owner)

- DNS resolves; site + HTTPS live. Nameserver/registrar audit and TLS expiry need to be run from a network with unrestricted egress (or on-server): `dig NS alaminn.info` + `openssl s_client -connect alaminn.info:443`.

## Phase 10 — Production deploy (NOT PERFORMED — correct behaviour)

Production is already live and healthy; deploying from this sandbox is impossible (no SSH) and unnecessary. The safe path: owner merges this branch → CI green → run `deploy.yml` with secrets or the on-server scripts. Rollback path documented in `docs/ROLLBACK-GUIDE.md`.

## Phase 11 — Reporting

`docs/FINAL-IMPLEMENTATION-REPORT.md` — statuses per required matrix, evidence, blockers, release decision.

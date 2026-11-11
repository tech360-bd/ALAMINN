# Security Policy — Alaminn.info

## Reporting a Vulnerability

We take security reports seriously. If you believe you have found a
security vulnerability in this repository or any deployed Alaminn.info
service, **please do NOT open a public GitHub issue**.

Email: **security@alaminn.info**

Please include:
- A clear description of the issue and its impact.
- The affected endpoint(s), file(s), or component(s).
- Steps to reproduce (proof-of-concept is appreciated but not required).
- Your name/handle for credit (optional).

### Response SLA

| Stage                          | Target   |
| ------------------------------ | -------- |
| Acknowledge receipt            | 72 hours |
| Initial triage + severity      | 7 days   |
| Fix or mitigation for critical | 14 days  |
| Fix or mitigation for high     | 30 days  |
| Public disclosure coordination| after fix is deployed |

We will credit reporters in the release notes unless they ask to remain
anonymous. We do not currently offer a paid bug bounty.

## Scope

**In scope:**
- The Next.js application in this repository (`src/**`).
- Public API endpoints under `/api/v1/**`.
- Admin API endpoints under `/api/v1/admin/**`.
- The Prisma data layer and database migrations (`prisma/**`).
- Webhook receivers for WhatsApp / social platforms.
- Deployed runtime at `alaminn.info` and subdomains.

**Out of scope:**
- Self-hosted forks modified beyond this repository.
- Third-party SaaS dashboards (Meta, OpenAI, etc.) — report to the
  vendor directly.
- Issues requiring compromised credentials of a legitimate user.
- Spam or social-engineering reports.

## Architecture Summary

This codebase implements the security controls documented in
`docs/ALAMINN_SECURITY_ARCHITECTURE.md`. The headline controls:

- **HMAC authentication.** Social-platform webhooks (Meta, etc.) are
  verified with HMAC-SHA256 signatures before any business logic runs.
  Referral tokens handed off between `alaminn.info` and the ALO
  Education sister-platform are signed with HMAC-SHA256 and short-lived
  (24h TTL); they carry no PII.
- **11-role RBAC.** Role-based access control with 11 named roles
  (`super-admin`, `admin`, `higher-study-editor`, `social-manager`,
  `ai-approver`, etc.). Every admin API route calls `requirePermission`
  which re-checks the user's role against the database on every request
  (so a suspended user loses access immediately, not at session
  expiry). See `src/lib/rbac.ts` and `src/lib/auth.ts`.
- **Rate-limiting.** Public AI endpoints (WhatsApp chat, higher-study
  advisor) enforce per-IP rate limits via in-memory maps. The WhatsApp
  webhook enforces a stricter limit. Cron endpoints require a
  shared-secret bearer token.
- **Audit logging.** Every state-changing admin action writes an
  `AuditLog` row with actor, action, resource, and a metadata blob.
  Public AI endpoints write an audit row per request with IP, provider
  used, model, latency, and grounding count.
- **Encryption at rest.** Social-platform OAuth tokens are stored
  AES-256-GCM encrypted (`src/lib/social/crypto.ts`); the encryption
  key is held in `SOCIAL_TOKEN_ENCRYPTION_KEY` and never committed.
- **PII redaction.** Public API responses use Prisma `select` objects
  to exclude internal fields (audit columns, contact emails/phones,
  raw JSON columns). See `publicUniversitySelect` /
  `publicCourseSelect` / `publicScholarshipSelect` /
  `publicSupervisorSelect` in `src/lib/higher-study/api-helpers.ts`.
  Visitor IPs are stored only as a one-way SHA-256 hash salted with the
  app secret.

## CI Controls

The following checks run on every pull request via GitHub Actions:

| Workflow                  | File                                | Purpose                                            |
| ------------------------- | ----------------------------------- | -------------------------------------------------- |
| CodeQL                    | `.github/workflows/codeql.yml`      | Static analysis for JS/TS with `security-extended` |
| Supply-chain              | `.github/workflows/supply-chain.yml`| gitleaks + `npm audit` + dependency-review         |
| Dependabot                | `.github/dependabot.yml`            | Weekly grouped dependency PRs                      |

A PR cannot be merged if any of these fail.

## Backup & Recovery

Database backups are taken daily via the scripts in `deploy/` and
`scripts/backup-db.ts`. Restore procedures are documented in
`docs/disaster-recovery.md`. Backup integrity is verified by
`deploy/verify-backup.sh` on a weekly cron.

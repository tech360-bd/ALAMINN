# Security & Privacy

## Purpose

Summarises the security + privacy controls that apply to the higher-study
platform on alaminn.info. The controls are inherited from the wider
Alaminn.info security architecture (see `docs/ALAMINN_SECURITY_ARCHITECTURE.md`)
and applied to the higher-study data layer specifically.

## Controls in force

### Authentication + HMAC
- **HMAC-SHA256 webhook verification.** Social-platform webhooks
  (Meta, etc.) are verified before any business logic runs.
- **HMAC-SHA256 referral tokens.** Referrals between alaminn.info and
  ALO Education are signed (24h TTL, no PII encoded). See
  `src/lib/higher-study/api-helpers.ts#signReferralToken`.

### Role-based access control (11 roles)
- The platform implements 11 named roles
  (`super-admin`, `admin`, `higher-study-editor`, `social-manager`,
  `ai-approver`, etc.). See `src/lib/rbac.ts`.
- Every admin API route calls `requirePermission` which re-checks the
  user's role against the database on every request — a suspended user
  loses access immediately, not at session expiry. See
  `src/lib/auth.ts`.

### Rate-limiting
- Public AI endpoints (`/api/v1/whatsapp/chat`,
  `/api/v1/higher-study/advisor/chat`) enforce per-IP rate limits via
  in-memory maps.
- The WhatsApp webhook enforces a stricter limit (20 / 10 min / IP).
- Cron endpoints require a shared-secret bearer token
  (`src/lib/cron-auth.ts`).

### Audit logging
- Every state-changing admin action writes an `AuditLog` row with
  actor, action, resource, resourceId, and a metadata blob.
- Public AI endpoints write an audit row per request with IP,
  provider used, model, latency, and grounding count.
- See `src/lib/admin-api.ts#writeAudit` and the
  `db.auditLog.create` call sites across `src/lib/whatsapp/leads.ts`,
  `src/app/api/v1/whatsapp/webhook/route.ts`, and the new
  `src/app/api/v1/higher-study/advisor/chat/route.ts`.

### Encryption at rest
- Social-platform OAuth tokens are stored AES-256-GCM encrypted
  (`src/lib/social/crypto.ts`); the encryption key is held in
  `SOCIAL_TOKEN_ENCRYPTION_KEY` and never committed.
- The same AES-256-GCM pattern is planned for proposal/SOP artefacts
  (see `human-review-and-secure-delivery.md`).

### PII redaction
- Public API responses use Prisma `select` objects to exclude
  internal fields (audit columns, contact emails/phones, raw JSON
  columns). See `publicUniversitySelect` /
  `publicCourseSelect` / `publicScholarshipSelect` /
  `publicSupervisorSelect` in `src/lib/higher-study/api-helpers.ts`.
- Visitor IPs are stored only as a one-way SHA-256 hash salted with
  the app secret (`hashIp` in `api-helpers.ts`).

## Privacy posture

The platform collects only the minimum PII required to fulfil an
enquiry. Applicant documents (proposals, SOPs) will be encrypted at
rest once the proposal-builder / SOP-builder features ship. Direct
contact details for supervisors are never published — contact is
routed through the referral handoff.

## Current status

**Implemented:** all controls listed above (except proposal/SOP
encryption, which depends on the not-yet-shipped proposal-builder /
SOP-builder features). **Active:** the priority-27 verification pass
is the operational focus; security controls are stable.

## Related files

- `src/lib/auth.ts`, `src/lib/rbac.ts` — auth + RBAC.
- `src/lib/cron-auth.ts` — cron shared-secret auth.
- `src/lib/higher-study/api-helpers.ts` — HMAC referral tokens, IP
  hashing, PII-free Prisma selects.
- `src/lib/social/crypto.ts` — AES-256-GCM token encryption.
- `src/lib/middleware/rate-limiter.ts` — rate-limiter middleware.
- `src/lib/middleware/audit-logger.ts` — audit logger middleware.
- `.github/SECURITY.md` — vulnerability-reporting policy.

## Spec reference

`docs/ALAMINN_SECURITY_ARCHITECTURE.md` and
`docs/audit/SECURITY_AND_BACKUP_STATUS.md`.

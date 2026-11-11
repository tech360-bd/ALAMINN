# Human Review & Secure Delivery

## Purpose

Documents the human-in-the-loop review queue and the secure delivery
mechanism for sensitive artefacts (research proposals, SOPs,
recommendation letters, scholarship applications) that pass through
the Alaminn.info higher-study platform. Secure delivery ensures that
applicant documents are reviewed by a named, authorised editor before
being handed to the supervisor / institution via the ALO Education
referral.

## Current status — NOT YET IMPLEMENTED for proposals

**Implemented (general):**
- Admin approvals queue at `/admin/approvals/page.tsx` for
  social / AI content (used by the social command center).
- Audit logging of every state-changing admin action.
- 11-role RBAC with `requirePermission` re-checking the user's role
  against the database on every request.

**NOT implemented (for higher-study proposals / SOPs):**
- A dedicated review queue for `HigherStudyProposalDraft` and
  `HigherStudySopDraft` records (these models do not yet exist — see
  `proposal-builder.md` and `sop-builder.md`).
- A secure-delivery channel that encrypts the artefact at rest
  (AES-256-GCM, mirroring `src/lib/social/crypto.ts`) and only
  decrypts it for the named reviewer + the named ALO Education
  recipient.
- A read-receipt + tamper-evident audit log of who opened the
  artefact, when, and from what IP.

## Planned design

When implemented, the secure-delivery flow will be:

1. Applicant finalises a draft → status `pending_review`.
2. Editor (role `higher-study-editor`) picks up the draft from the
   review queue, reviews content + fact-checks against the verified
   catalogue.
3. Editor approves → draft is encrypted at rest with AES-256-GCM,
   status `approved`, signed referral token created.
4. ALO Education receives the referral, fetches the encrypted
   artefact over a mutually-authenticated channel, decrypts with the
   shared key, delivers to the named supervisor.
5. Every step audit-logged with actor, action, timestamp, IP hash.

## Related files

- `src/app/admin/approvals/page.tsx` — existing approvals queue (social
  content; the higher-study equivalent is planned).
- `src/lib/social/crypto.ts` — `encryptToken` / `decryptToken`
  (AES-256-GCM). The proposal/SOP encryption will reuse this pattern.
- `src/lib/auth.ts` — `requirePermission` guard.
- `src/lib/admin-api.ts` — `writeAudit` helper.
- `prisma/schema.prisma` — `AuditLog` model.

## Spec reference

`docs/higher-study/security-and-privacy.md` and
`MASTER-SPECIFICATION.md` §42.10 (human review + secure delivery).

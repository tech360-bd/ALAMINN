# Application CRM Workflow

## Purpose

Documents how an enquiry on alaminn.info becomes a tracked application
in the ALO Education CRM. The workflow spans two platforms: alaminn.info
captures the enquiry and creates a signed referral; ALO Education
fulfils the referral and tracks the application through its stages.

## Current status — PARTIAL

**Implemented on alaminn.info:**
- Public enquiry capture via the WhatsApp AI agent
  (`/api/v1/whatsapp/webhook`, `/api/v1/whatsapp/chat`).
- Contact upsert + inquiry creation in the local CRM
  (`src/lib/whatsapp/leads.ts`).
- HMAC-signed referral token creation
  (`src/lib/higher-study/api-helpers.ts#signReferralToken`).
- Basic deal/opportunity tracking in the admin CRM
  (`/api/v1/admin/crm/route.ts`, `/admin/crm/page.tsx`) with stages
  `new / qualified / submitted / accepted / rejected / closed`.
- Audit log entry on every state-changing action.

**NOT implemented:**
- Full application-stage tracking (submitted → acknowledged →
  interview → offer → CAS → visa → enrolled) lives in ALO Education,
  not in this repository. The local CRM tracks only the alaminn.info
  side of the handoff.
- Bidirectional sync between ALO Education application stages and the
  alaminn.info opportunity stage — currently one-way (alaminn.info →
  ALO Education via referral).
- Automated stage-advance notifications back to the applicant.

## Referral handoff (implemented)

```
[applicant on alaminn.info]
        │
        │  submit enquiry / consultation request
        ▼
[alaminn.info creates Contact + Inquiry + Opportunity]
        │
        │  signReferralToken({ code, type, iat, exp })  (HMAC-SHA256, 24h TTL)
        ▼
[referral token handed to ALO Education via signed URL]
        │
        │  ALO Education verifies signature with shared secret
        ▼
[ALO Education creates application record, tracks stages]
```

The referral token carries *no PII* — only a referral code, a referral
type, an issued-at timestamp, and an expiry. ALO Education uses the
referral code to look up the contact in the shared contact DB.

## Related files

- `src/lib/whatsapp/leads.ts` — enquiry → contact + inquiry + audit.
- `src/lib/higher-study/api-helpers.ts` — `signReferralToken` /
  `verifyReferralToken`.
- `src/app/api/v1/admin/crm/route.ts` — local CRM API.
- `src/app/admin/crm/page.tsx` — local CRM UI.
- `src/app/api/v1/english-learning/referral/route.ts` — example
  referral-creation endpoint (the higher-study equivalent is planned).
- `docs/deliverables/ALO_EDUCATION_INTEGRATION.md` — integration spec.

## Spec reference

`docs/higher-study/architecture-and-platform-ownership.md` and
`MASTER-SPECIFICATION.md` §4 (platform ownership) + §42.9 (CRM).

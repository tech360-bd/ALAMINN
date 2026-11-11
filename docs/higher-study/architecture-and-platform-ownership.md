# Architecture & Platform Ownership

## Purpose

Documents the two-platform architecture of the Alaminn.info higher-study
product: the public-facing **alaminn.info** portal (this repository)
and the sister-platform **ALO Education** that owns the actual
admissions / referral fulfilment workflow. The two platforms are
integrated but legally and operationally distinct.

## Platform split

| Concern                                  | Owner            |
| ---------------------------------------- | ---------------- |
| Public higher-study catalogue (browse)   | alaminn.info     |
| Public AI advisor + eligibility engine   | alaminn.info     |
| Verified-data monitoring + re-verification| alaminn.info    |
| Referral creation (HMAC-signed token)    | alaminn.info     |
| Referral fulfilment / application CRM    | ALO Education    |
| Student records + document collection    | ALO Education    |
| Payment for application services         | ALO Education    |

Handoffs happen via short-lived (24h) HMAC-SHA256 signed referral
tokens. Tokens carry *no PII* — only a referral code, a referral type,
an issued-at timestamp, and an expiry. The receiver (ALO Education)
verifies the signature with the shared secret
(`HIGHER_STUDY_REFERRAL_SECRET`) before accepting the handoff.

## Current status

**Implemented:** HMAC referral token signing/verification
(`src/lib/higher-study/api-helpers.ts`), public catalogue API, AI
advisor grounding in the verified catalogue. **Partial:** referral
fulfilment is initiated from alaminn.info but full application-stage
tracking lives in ALO Education (see
`application-crm-workflow.md`). **Not implemented:** direct ALO
Education SSO; users currently authenticate separately on each
platform.

## Related files

- `src/lib/higher-study/api-helpers.ts` — `signReferralToken` /
  `verifyReferralToken` (HMAC-SHA256).
- `src/app/api/v1/english-learning/referral/route.ts` — referral
  creation endpoint (mirrors the pattern planned for higher-study).
- `docs/deliverables/ALO_EDUCATION_INTEGRATION.md` — integration spec.
- `config/domains.json` — platform domain configuration.

## Spec reference

`MASTER-SPECIFICATION.md` §4 (platform ownership) and §42 (higher-study
platform). `docs/ALAMINN_INTEGRATION_PLAN.md` for the full integration
roadmap.

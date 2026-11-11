# Supervisor Discovery

## Purpose

Documents the supervisor discovery flow at `/higher-study/supervisors/`.
The platform lists academics who are accepting research students,
their research interests, and a link to their official public profile.
Direct contact is *only* possible via the secure ALO Education referral
handoff — supervisor email/phone is never published.

## Data model

The `HigherStudySupervisor` model (`prisma/schema.prisma`) carries:

- `slug`, `name`, `academicTitle` (Professor / Dr / Lecturer).
- `universityId` (FK to `HigherStudyUniversity`).
- `department`, `publicProfileUrl`.
- `researchAreaId` (FK to `HigherStudyResearchArea`).
- `researchInterests` (comma-separated).
- `selectedPublications`, `currentProjects` (JSON strings).
- `acceptingStudents` (boolean — the primary filter on the list page).
- `applicationGuidance` (free text — what the supervisor expects in an
  approach email).
- `verificationStatus`, `publicationStatus`, `lastVerifiedAt`,
  `lastVerifiedBy`, `officialSourceUrl` (the evidence chain).

Direct contact fields (email, phone) are deliberately absent from the
model — contact is routed through the referral flow.

## Public API

`GET /higher-study/supervisors` — paginated list, filterable by
`acceptingStudents`, `universitySlug`, `researchAreaSlug`,
`countrySlug`. Returns the public-supervisor select shape (no PII).

`GET /higher-study/supervisors/[supervisorSlug]` — detail page with
the supervisor profile + a "request introduction" CTA that creates a
referral (HMAC-signed token) handoff to ALO Education.

## Current status

**Implemented:** list page with filters, detail page, supervisor-card
component, public API select (PII-free), referral handoff. **Pending:**
re-verification pass — most supervisor rows are still
`pending-review`; the `acceptingStudents` flag is only trustworthy
once a row is `verified`.

## Related files

- `prisma/schema.prisma` — `HigherStudySupervisor` model.
- `src/app/higher-study/supervisors/page.tsx` — list.
- `src/app/higher-study/supervisors/[supervisorSlug]/page.tsx` — detail.
- `src/components/higher-study/supervisor-card.tsx` — UI.
- `src/lib/higher-study/api-helpers.ts` — `publicSupervisorSelect`
  (PII-free Prisma select) + `signReferralToken`.
- `src/app/admin/higher-study/supervisors/page.tsx` — admin CRUD.

## Spec reference

`docs/higher-study/uk-mphil-phd-discovery.md` and
`MASTER-SPECIFICATION.md` §42.5.

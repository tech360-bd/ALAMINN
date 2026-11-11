# Global University Source Register

## Purpose

The `HigherStudyUniversity` Prisma model is the canonical source
register for every university surfaced on the alaminn.info higher-study
portal. Every row is created with `verificationStatus="pending-review"`
and only promoted to `"verified"` once the monitoring runner has
re-fetched the official catalogue and a human editor has signed off.

## Model fields (key)

| Field                       | Purpose                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `slug`                      | URL-safe identifier (e.g. `university-of-oxford`).         |
| `officialName`              | Legal name as published on the institution's website.      |
| `officialWebsite`           | Root homepage URL — used by the monitoring runner.         |
| `institutionType`           | `public` / `private` / `specialist` / `conservatoire` etc. |
| `hasMBA / hasMRes / hasMPhil / hasPhD / hasProfessionalDoctorate` | Level flags. |
| `academicEntryRequirements` | Free-text summary of academic thresholds.                  |
| `countrySpecificRequirements` | Per-country entry notes (Bangladesh, India, etc.).       |
| `ieltsRequirement / pteRequirement / toeflRequirement / duolingoRequirement / languageCertRequirement / oxfordElltRequirement / ieltsUkviRequirement` | Per-test requirement blurbs. |
| `englishWaiverPolicy`       | When the institution waives the English-test requirement.  |
| `verificationStatus`        | `draft` / `pending-review` / `verified` / `published` / `needs-update` / `archived`. |
| `publicationStatus`         | `draft` / `published` / `archived` (separate from verification). |
| `lastVerifiedAt / lastVerifiedBy / officialSourceUrl` | Evidence chain for re-verification. |

Full schema: `prisma/schema.prisma` §HigherStudyUniversity.

## Monitoring engine

The monitoring engine (`src/lib/higher-study/monitoring/`) re-fetches
each university's `officialSourceUrl` on a schedule, diffs the result
against the stored snapshot, and flags rows as `needs-update` when
material fields change. A human editor then re-verifies.

## Current status

**Implemented:** model + 70+ seeded universities (UK, NZ, AU, IE, CA,
USA) in `prisma/seed-higher-study-more.ts` with `pending-review`
status and NULL fees/requirements until verified. **Implemented:**
monitoring engine + cron runner
(`/api/cron/higher-study-monitor/route.ts`). **Implemented:**
priority-27 dashboard API
(`/api/v1/higher-study/admin/priority-27/route.ts`). **Pending:** the
27 priority UK universities are the verification focus.

## Related files

- `prisma/schema.prisma` — `HigherStudyUniversity` model.
- `prisma/seed-higher-study.ts` / `prisma/seed-higher-study-more.ts` — seed data.
- `src/lib/higher-study/monitoring/engine.ts` + `runner.ts`.
- `src/app/api/v1/higher-study/admin/priority-27/route.ts`.
- `src/app/admin/higher-study/universities/page.tsx` — admin CRUD UI.

## Spec reference

`docs/higher-study/global-university-source-register.md` (this file)
and `MASTER-SPECIFICATION.md` §42.

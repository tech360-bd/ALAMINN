# Bangladesh Study Pathway

## Purpose

A dedicated pathway for students resident in Bangladesh who want to
study abroad — covering typical academic backgrounds (HSC, BUET, DU,
BRAC, NSU, etc.), common English-test patterns, financial-evidence
requirements for visa purposes, and scholarship opportunities that
are particularly relevant to Bangladeshi applicants (Chevening,
Commonwealth, university-specific country awards).

## Current status

**NOT YET IMPLEMENTED.** This page/feature is documented as a planned
item; no route, component, or seed data exists yet. When implemented,
it will live at `/higher-study/destinations/bangladesh` (or a
dedicated `/higher-study/bangladesh-pathway` route) and consume the
existing `HigherStudyCountry` model augmented with country-specific
advice fields.

The planned scope includes:

- HSC → UK foundation / international-year-one pathways.
- Bachelor's (BSc/BA) → UK MSc / MRes entry requirements.
- Common English-test waivers for English-medium Bangladeshi
  institutions.
- Chevening + Commonwealth scholarship eligibility notes.
- UK Student Route visa financial-evidence thresholds.
- Verified education-agent referral (via the existing ALO Education
  HMAC referral handoff).

## Related files

- `prisma/seed-countries-extra.ts` — seeds `HigherStudyCountry` rows
  (Bangladesh is included as a *destination* but not yet as an
  *origin* pathway).
- `src/app/higher-study/destinations/[countrySlug]/page.tsx` — country
  detail template that the Bangladesh pathway will reuse.
- `src/lib/higher-study/api-helpers.ts` — referral token signing for
  the agent handoff.

## Spec reference

Planned in `MASTER-SPECIFICATION.md` §42.6 (country-specific
pathways). Not yet scoped on the public roadmap.

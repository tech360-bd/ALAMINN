# UK MPhil / PhD Discovery

## Purpose

Documents the UK MPhil / PhD discovery flow at
`/higher-study/phd-research/`. Prospective postgraduate researchers
use this hub to find universities that supervise their research area,
identify funded projects, and contact supervisors (via the secure
referral handoff — supervisors' direct contact details are never
published).

## Data model

The `HigherStudyUniversity` model carries boolean flags for each
research-degree level it awards:

- `hasMRes` — Master of Research (typically 1 year, research-led).
- `hasMPhil` — Master of Philosophy (typically 1–2 years, standalone
  or PhD-track year 1).
- `hasPhD` — Doctor of Philosophy.
- `hasProfessionalDoctorate` — EdD, DBA, DProf, etc.

These flags are surfaced as filters on the PhD discovery hub and the
university list page. The `HigherStudyResearchProject` model carries
the individual funded project listings (with `fundingStatus`,
`stipend`, `applicationDeadline`).

The `HigherStudySupervisor` model is the per-academic profile (name,
academic title, department, research interests, accepting-students
flag, application-guidance blurb). Supervisors are reachable only via
their `publicProfileUrl` or through a referral — never direct email.

## Current status

**Implemented:** university-level `hasPhD` / `hasMPhil` flags +
filter UI at `/higher-study/phd-research/`. **Implemented:**
supervisor discovery at `/higher-study/supervisors/` and
`/higher-study/supervisors/[supervisorSlug]/`. **Implemented:**
research-project discovery at `/higher-study/research/`. **Pending:**
funded-project re-verification pass for the priority-27 universities
(most `HigherStudyResearchProject` rows are still `pending-review`).

## Related files

- `prisma/schema.prisma` — `HigherStudyUniversity.hasPhD / hasMPhil /
  hasMRes / hasProfessionalDoctorate`, `HigherStudyResearchProject`,
  `HigherStudySupervisor`.
- `src/app/higher-study/phd-research/page.tsx` — discovery hub.
- `src/app/higher-study/supervisors/page.tsx` — supervisor list.
- `src/app/higher-study/supervisors/[supervisorSlug]/page.tsx` —
  supervisor detail.
- `src/app/higher-study/research/page.tsx` — research project list.
- `src/components/higher-study/supervisor-card.tsx` — UI component.

## Spec reference

`docs/higher-study/supervisor-discovery.md` and
`MASTER-SPECIFICATION.md` §42.5 (PhD / research discovery).

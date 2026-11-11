# alaminn.info Portal Specification

## Purpose

Catalogues the public-facing higher-study pages on alaminn.info. As of
the current branch there are **38 pages** under `/higher-study/`, all
server-rendered Next.js App-Router routes backed by the Higher Study
Prisma models.

## Page inventory (38)

### Top-level + navigation
1. `/higher-study` — hub/landing.
2. `/higher-study/eligibility-check` — universal eligibility checker.
3. `/higher-study/course-finder` — course discovery tool.
4. `/higher-study/application-guide` — long-form guide.
5. `/higher-study/apply` — application intake / referral start.
6. `/higher-study/book-consultation` — consultation booking.
7. `/higher-study/saved` — saved items (universities / courses / etc).

### Universities
8. `/higher-study/universities` — list.
9. `/higher-study/universities/uk` — UK filter shortcut.
10. `/higher-study/universities/[universitySlug]` — detail.
11. `/higher-study/universities/[universitySlug]/courses` — courses at uni.
12. `/higher-study/universities/[universitySlug]/research` — research at uni.
13. `/higher-study/universities/[universitySlug]/scholarships` — scholarships at uni.
14. `/higher-study/uk-universities` — UK landing.
15. `/higher-study/global-universities` — global landing.

### Courses
16. `/higher-study/courses` — list.
17. `/higher-study/courses/[courseSlug]` — detail.

### Scholarships
18. `/higher-study/scholarships` — list.
19. `/higher-study/scholarships/[scholarshipSlug]` — detail.

### Research / PhD
20. `/higher-study/research` — research project list.
21. `/higher-study/research/[researchSlug]` — detail.
22. `/higher-study/phd-research` — PhD/MPhil discovery hub.

### Supervisors
23. `/higher-study/supervisors` — list.
24. `/higher-study/supervisors/[supervisorSlug]` — detail.

### Subjects + Intakes + Destinations
25. `/higher-study/subjects` — list.
26. `/higher-study/subjects/[subjectSlug]` — detail.
27. `/higher-study/intakes` — list.
28. `/higher-study/intakes/[intakeSlug]` — detail.
29. `/higher-study/destinations` — list.
30. `/higher-study/destinations/[countrySlug]` — country detail.
31. `/higher-study/destinations/[countrySlug]/[citySlug]` — city detail.

### Resources
32. `/higher-study/resources` — list.
33. `/higher-study/resources/[resourceSlug]` — detail.
34. `/higher-study/study-resources` — resource hub.

### Compare
35. `/higher-study/compare` — hub.
36. `/higher-study/compare/universities` — side-by-side compare.
37. `/higher-study/compare/courses` — compare.
38. `/higher-study/compare/scholarships` — compare.

## Current status

All 38 routes render successfully from the verified + published
catalogue. Routes that depend on `verificationStatus="verified"` are
gated at the data layer (see
`src/lib/higher-study/api-helpers.ts`). The eligibility-check page is
the primary consumer of the Universal English-Test Engine.

## Related files

- `src/app/higher-study/**` — all 38 page components.
- `src/app/higher-study/_lib/**` — shared search-param + detail helpers.
- `src/app/higher-study/layout.tsx` — shared layout / navbar.
- `src/components/higher-study/**` — UI components.

## Spec reference

`docs/HIGHER-STUDY-GUIDE.md` and `docs/ROUTE-INVENTORY.md` for the
wider route map.

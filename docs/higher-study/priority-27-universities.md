# Priority 27 UK Universities

## Purpose

Lists the 27 UK universities that the alaminn.info higher-study
platform is committed to seeding with at minimum MSc + MRes + PhD
course records, verified entry requirements, and verified English-test
requirements. This is the single source of truth for "what counts as
priority-27" — the slug array lives in
`src/app/api/v1/higher-study/admin/priority-27/route.ts`.

## The 27 slugs (priority order)

1. `university-of-oxford`
2. `university-of-cambridge`
3. `imperial-college-london`
4. `ucl`
5. `london-school-of-economics`
6. `kings-college-london`
7. `university-of-edinburgh`
8. `university-of-manchester`
9. `university-of-warwick`
10. `university-of-bristol`
11. `university-of-leeds`
12. `university-of-glasgow`
13. `durham-university`
14. `university-of-birmingham`
15. `university-of-nottingham`
16. `university-of-southampton`
17. `university-of-sheffield`
18. `university-of-york`
19. `lancaster-university`
20. `university-of-bath`
21. `university-of-exeter`
22. `queen-mary-university-of-london`
23. `university-of-liverpool`
24. `cardiff-university`
25. `newcastle-university`
26. `queens-university-belfast`
27. `university-of-leicester`

## Dashboard API

`GET /api/v1/higher-study/admin/priority-27` — gated behind the
`higher-study.universities.view` permission. Returns a completion
matrix:

```json
{
  "totalUniversities": 27,
  "seededUniversities": 27,
  "missingUniversities": 0,
  "overallCompletionPct": 42,
  "universities": [
    {
      "slug": "university-of-oxford",
      "exists": true,
      "officialName": "University of Oxford",
      "officialWebsite": "https://www.ox.ac.uk/",
      "verificationStatus": "verified",
      "lastVerifiedAt": "2025-01-10T...",
      "officialSourceUrl": "https://www.ox.ac.uk/",
      "coverage": {
        "academicEntryRequirements": true,
        "englishWaiverPolicy": false,
        "ieltsRequirement": true,
        "pteRequirement": false,
        "toeflRequirement": true,
        "duolingoRequirement": false,
        "hasCourses": true,
        "hasSupervisorsOrScholarships": true
      },
      "coveragePct": 62
    }
  ]
}
```

Eight coverage categories per university. The
`overallCompletionPct` is the mean of all per-university
`coveragePct` values.

## Current status

All 27 slugs are seeded (rows exist in `HigherStudyUniversity`).
Coverage is partial — most rows are still `pending-review` with NULL
fee/requirement fields until the verification workflow completes. The
dashboard endpoint is the operational view of progress.

## Related files

- `src/app/api/v1/higher-study/admin/priority-27/route.ts` — dashboard
  API + `PRIORITY_27_SLUGS` constant.
- `prisma/seed-higher-study-more.ts` — seed data (the priority 27 are
  a subset of the 70+ UK/IE/AU/CA/USA unis seeded here).
- `src/app/admin/higher-study/universities/page.tsx` — per-university
  admin CRUD UI.

## Spec reference

`docs/higher-study-catalogue-baseline.md` and this file.

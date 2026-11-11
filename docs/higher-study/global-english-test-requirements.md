# Global English-Test Requirements

## Purpose

Documents the Universal English-Test Engine at
`src/lib/higher-study/english-test-engine.ts`. The engine is the
single source of truth for "does this student's verified English-test
attempt meet this course's published English-language requirement?"
It returns one of 9 canonical outcomes and never fabricates an
admission / scholarship / CAS / visa guarantee.

## Catalogue — 18 tests

| Slug                              | Test                              | Max overall |
| --------------------------------- | --------------------------------- | ----------- |
| `ielts_academic`                  | IELTS Academic                    | 9           |
| `ielts_ukvi_academic`             | IELTS Academic UKVI               | 9           |
| `ielts_one_skill_retake`          | IELTS One Skill Retake            | 9           |
| `pte_academic`                    | PTE Academic                      | 90          |
| `pte_academic_ukvi`               | PTE Academic UKVI                 | 90          |
| `toefl_ibt`                       | TOEFL iBT                         | 120         |
| `toefl_ibt_home`                  | TOEFL iBT Home Edition            | 120         |
| `cambridge_c1_advanced`           | Cambridge C1 Advanced (CAE)       | grade       |
| `cambridge_c2_proficiency`        | Cambridge C2 Proficiency (CPE)    | grade       |
| `languagecert`                    | LanguageCert Academic / SELT      | 50          |
| `oxford_test_of_english`          | Oxford Test of English            | 120         |
| `oxford_test_of_english_advanced` | Oxford Test of English Advanced   | 120         |
| `trinity_ise`                     | Trinity ISE                       | grade       |
| `duolingo`                        | Duolingo English Test             | 160         |
| `versant`                         | Versant English Test              | 80          |
| `university_administered`         | University-administered assessment| n/a         |
| `presessional_pathway`            | Pre-sessional English pathway     | n/a         |
| `english_medium_exemption`        | English-medium instruction exemption| n/a       |

## The 9 outcomes

1. `VERIFIED_SCORE_MATCH` — verified attempt meets every published
   threshold. **Not an admission guarantee.**
2. `POTENTIAL_MATCH_REVIEW_REQUIRED` — score may match but the attempt
   is self-reported / unverified.
3. `DOES_NOT_MEET_PUBLISHED_REQUIREMENT` — overall or component below
   the published minimum.
4. `INSUFFICIENT_INFORMATION` — a required component score is missing.
5. `TEST_NOT_CONFIRMED_AS_ACCEPTED` — the institution does not list
   this test type for this course.
6. `RESULT_EXPIRED_OR_VALIDITY_UNCONFIRMED` — test date is outside the
   catalogue's validity window (usually 24 months).
7. `OFFICIAL_ALTERNATIVE_ROUTE_AVAILABLE` — institution publishes an
   alternative route (pre-sessional, exemption).
8. `CONFLICTING_REQUIREMENTS` — institution publishes conflicting
   thresholds across sources.
9. `MANUAL_REVIEW_REQUIRED` — engine cannot decide; escalate to human.

## Engine API

```ts
evaluateEnglishEligibility(attempt, requirement, now?) → EligibilityResult
evaluateStudentProfile(attempts[], requirement, now?) → EligibilityResult
getTestDefinition(testId) → EnglishTestDefinition | undefined
isKnownTestId(testId) → boolean
ENGLISH_TEST_ENGINE_VERSION = "1.0.0"
```

## Current status

**Implemented:** the full 18-test catalogue, the 9-outcome evaluation
function, multi-attempt best-outcome selection, grade-based comparison
for Cambridge/Trinity, validity-window checks. **Implemented:** unit
tests in `tests/unit/higher-study/english-test-engine.test.ts`
covering all 9 outcomes. **Pending:** wiring the engine into the
public eligibility-check page (`/higher-study/eligibility-check`) and
the AI advisor grounding.

## Related files

- `src/lib/higher-study/english-test-engine.ts` — the engine.
- `tests/unit/higher-study/english-test-engine.test.ts` — unit tests.
- `src/app/higher-study/eligibility-check/page.tsx` — public UI.
- `prisma/schema.prisma` — `englishRequirements` JSON column on
  `HigherStudyCourse`.

## Spec reference

This file and `MASTER-SPECIFICATION.md` §42.4 (English-test
eligibility).

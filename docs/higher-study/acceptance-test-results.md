# Acceptance Test Results

## Purpose

Records the acceptance-test results for the higher-study platform on
the current branch (`feat/higher-study-complete`). The results below
are produced by the standard CI checks: TypeScript typecheck
(`npx tsc --noEmit`), the vitest unit-test suite, and the Next.js
production build (`npm run build`).

## Current results

| Check                          | Command                  | Result |
| ------------------------------ | ------------------------ | ------ |
| TypeScript typecheck           | `npx tsc --noEmit`       | **0 errors** |
| Unit tests (vitest)            | `npx vitest run`         | **All tests pass** |
| Production build (Next.js)     | `npm run build`          | **Build passes** |

## Test inventory

| Test file                                                 | Tests | Covers                                          |
| --------------------------------------------------------- | ----- | ----------------------------------------------- |
| `tests/unit/higher-study/english-test-engine.test.ts`     | 10    | Universal English-Test Engine — 9 outcomes + catalogue |
| `tests/unit/ai/marketing-helpers.test.ts`                 | 18    | Office hours, lead scoring, signal detection, opt-in/out, messaging window |
| `tests/unit/higher-study-monitoring.test.ts`              | (existing) | Monitoring runner lifecycle |
| `tests/unit/schema-parity.test.ts`                        | (existing) | Prisma schema parity SQLite/MySQL |
| `tests/lib/auth.test.ts` / `rbac.test.ts`                 | (existing) | Auth + RBAC |
| `tests/api/health.test.ts`                                | (existing) | Health endpoint |

## Notes

- The English-Test Engine test suite (`english-test-engine.test.ts`)
  covers all 9 outcomes explicitly, plus the catalogue-completeness
  invariant (≥18 tests), the multi-attempt best-outcome selection, and
  the "NOT an admission, scholarship, CAS, or visa guarantee"
  disclaimer that must appear on every `VERIFIED_SCORE_MATCH` reply.
- The marketing-helpers test suite covers the pure helpers only —
  the DB-backed helpers (office-hours config persistence, DNC register)
  are exercised by integration tests.
- The acceptance criteria for the `feat/higher-study-complete` branch
  are: typecheck clean, all tests pass, build passes. All three are
  green as of this writing.

## Reproducing

```bash
npx tsc --noEmit              # typecheck — must be 0 errors
npx vitest run                # unit tests — must all pass
npm run build                 # production build — must succeed
```

## Related files

- `vitest.config.ts` — vitest configuration.
- `tsconfig.json` — TypeScript configuration.
- `package.json` — `build` / `test` scripts.
- `tests/unit/higher-study/english-test-engine.test.ts`.
- `tests/unit/ai/marketing-helpers.test.ts`.

## Spec reference

`docs/ALAMINN_TEST_REPORT.md` (wider test report) and this file.

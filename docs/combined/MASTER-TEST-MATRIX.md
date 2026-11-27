# Master test matrix — incomplete

| Area / IDs | Existing or added test | Result and limitation |
|---|---|---|
| PWA SEC-03 | `tests/unit/service-worker-privacy.test.ts` | 9 simulated-worker tests pass; browser, shared-device and logout tests pending |
| Phone SEC-05 | `tests/unit/whatsapp-normalization.test.ts` | 11 targeted cases pass; provider send and legacy data migration unverified |
| Matching SEC-06 | `tests/unit/whatsapp-lead-matching.test.ts` | 4 mocked tests pass; owner isolation and legacy-format reconciliation absent |
| AI limit SEC-07 | `tests/unit/ai-services-rate-limit-capacity.test.ts` | 2 tests pass; distributed limits and trusted IP absent |
| Admin reset SEC-04 | `tests/api/admin-reset-concurrency.test.ts`; `tests/integration/auth-password-reset-session.test.ts` | Disposable API concurrency and session replay tests pass; mock suite 9 passed; MySQL and full race/rollback matrix pending |
| Staff auth SEC-01 | `tests/api/staff-lifecycle.test.ts` | Disposable staff reset and admin replay tests pass; MySQL and exhaustive route coverage pending |
| Other security, MAYA, Jara, connectors, deployment | Existing `tests/`; requested acceptance matrix not yet constructed | NOT VERIFIED; exact atomic requirement mapping remains outstanding |

| UCI SEC-08 | `tests/integration/uci-directory-pagination.test.ts` | 2 disposable SQLite tests passed; MySQL, concurrent changes and performance unverified |
| Admin password SEC-09 | `tests/unit/admin-password-policy.test.ts` | Byte-limit and legacy verification unit tests passed; endpoint coverage incomplete |

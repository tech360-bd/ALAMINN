# Implementation roadmap

1. Complete atomic requirement decomposition and production/data audit without accessing production without authorization.
2. Remediate P0 security with backwards-compatible dual-database migrations and real regression tests. Validate proxy topology before changing trust policy.
3. Design MAYA and Jara isolation, approved identity lifecycle, and data ownership; reuse existing CRM, provider and messaging infrastructure only after review.
4. Implement memory, knowledge, governed tools, communication and model routing with separately verified integrations.
5. Rehearse migration, backup and restore on disposable/staging data; run full tests and browser flows. Secure owner approval before production changes.
6. Reconcile every individual acceptance criterion against execution evidence. Never report mocks as provider tests.

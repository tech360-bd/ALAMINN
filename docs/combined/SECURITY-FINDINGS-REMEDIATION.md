# Security findings — verification in progress

All findings are confirmed by source inspection unless otherwise noted. Static confirmation is not a passing acceptance test. See `MASTER-REQUIREMENTS-REGISTER.md` for IDs and outstanding work.

| ID | Confirmed source/root cause | Severity | Change / regression / evidence | Status and remaining risk |
|---|---|---|---|---|
| SEC-01 | Admin JWT checks active user, not revocation; staff has DB sessions | P0 | Database-backed admin sessions; proxy checks persisted admin and staff sessions; disposable replay tests | PARTIAL: MySQL, all route families and login/reset race/rollback need further validation |
| SEC-02 | First forwarded-for value trusted; Nginx appends incoming value | P0 | None yet | NOT VERIFIED: spoofing and per-process limits |
| SEC-03 | `public/sw.js` caches successful navigations | P0 | See implementation status; targeted tests pass | PARTIAL |
| SEC-04 | Admin reset reads token then updates by id | P0 | Atomic conditional update; disposable SQLite API concurrency test and mocked route tests | PARTIAL: revocation added and tested on disposable SQLite; MySQL, race and rollback evidence incomplete |
| SEC-05 | `config.ts` drops leading 0 and prefixes only 88 | P0 | See implementation status; targeted tests pass | PARTIAL |
| SEC-06 | `leads.ts` uses substring phone match and updates personal data | P0 | Exact matching and no overwrite; mock regression tests pass | PARTIAL: no tenant isolation or migration for legacy formats |
| SEC-07 | In-memory map never sweeps expired keys | P1 | Bounded map and expiry tests pass | PARTIAL: trusted identity and distributed limit still needed |
| SEC-08 | Filtering is performed after database pagination | P1 | Filter before pagination with bounded batches; multi-page disposable SQLite tests | PARTIAL: scalability, concurrent writes and MySQL unverified |
| SEC-09 | Admin update omits password validation, bcrypt 72-byte issue | P0 | Shared executive password validation with bcrypt byte limit | PARTIAL: existing hashes remain compatible; endpoint and legacy hash migration coverage incomplete |
| SEC-10 | Inquiry test explicitly exercises rejection paths only | P1 | None yet | NOT VERIFIED |
| SEC-11 | Caddy port differs from systemd/Nginx; test README outdated | P1 | None yet | NOT VERIFIED: actual live topology unknown |

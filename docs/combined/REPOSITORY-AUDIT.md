# Repository audit (2026-11-27)

- Remote: https://github.com/tech360-bd/ALAMINN.git; GitHub reports default branch `main`.
- Working branch: `arena/79119621-alaminn`; starting commit: `51696308284ab71435db33589cfd358d86caa06d`. Working tree was clean on entry. GitHub returned no open pull requests. Only locally available branches were main and the working branch; this is not an exhaustive remote branch inventory.
- Node 22.22.3, npm lockfile, Next.js 16 App Router, TypeScript/React; Prisma 7 with SQLite and MySQL schemas and separate migration histories. Next standalone, custom server wrapper and mini-services coexist.
- Executive auth is cookie JWT plus active-user/role database checks; staff auth uses signed cookies and revocable `StaffSession` records. Proxy gates are in `src/proxy.ts`.
- Existing CRM, UCI, inquiry, higher study, WhatsApp, AI providers, messaging and automation are under `src/app`, `src/lib`, and `mini-services`. Tests are under `tests`, CI under `.github/workflows`.
- `rg` found no MAYA, Jara, or জারা references in source, migrations, mini-services or documentation; this is not proof about inaccessible external databases. No approved avatar reference was found under `public` or `storage`.
- No production database, production logs, deployed host or secrets were available in this workspace. `db` and `storage` contain only tracked access-control files and empty placeholders. No assertion about live data or backups can be made.
- Systemd/Nginx use 3056 in the checked-in config; Caddy points at 3000. Actual production topology, TLS and service status are unverified.
- `npm ci --no-audit --no-fund` completed successfully (exit 0) and generated the SQLite Prisma client; no production database was accessed.

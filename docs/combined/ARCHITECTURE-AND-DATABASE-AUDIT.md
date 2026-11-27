# Architecture and database audit (partial)

Next.js App Router and standalone server with TypeScript, React, Prisma 7 and a separate messaging mini-service. SQLite (`prisma/schema.prisma`) and MySQL/MariaDB (`prisma/schema.mysql.prisma`) have separate migration histories. `src/lib/db.ts` chooses an adapter based on `DATABASE_URL`. A `User` models executive accounts; `StaffAccount` and `StaffSession` model staff independently. Existing CRM `Contact` has no tenant/owner column: cross-account isolation cannot be honestly claimed without design and migration.

No existing database, production records, upload contents, infrastructure or backups were inspected; no schema changes or production migrations were made. Any future schema work needs provider parity, migration rehearsal and backup/restore proof. Jara's account model must be designed against both existing identity systems rather than silently using a privileged human account.

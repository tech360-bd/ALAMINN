import { resolveDatabaseUrl } from "./database-url";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

/**
 * Dual-mode Prisma driver adapter factory.
 *
 * The schema is generated with `engineType = "client"`, which means every
 * PrismaClient must be constructed with a driver adapter. Which adapter is
 * required depends on the DATABASE_URL scheme:
 *
 *   - mysql://  → @prisma/adapter-mariadb (production: alaminn.info / MariaDB)
 *   - file:, libsql:, http(s):// → @prisma/adapter-libsql (development: SQLite)
 */
export type DriverAdapter = PrismaLibSql | PrismaMariaDb;

export function isMysqlUrl(raw: string): boolean {
  return /^mysql:\/\//i.test(raw);
}

/** Build the driver adapter matching the given (or ambient) DATABASE_URL. */
export function createDriverAdapter(rawUrl?: string): DriverAdapter {
  const raw = resolveDatabaseUrl(rawUrl);
  if (isMysqlUrl(raw)) {
    const u = new URL(raw);
    return new PrismaMariaDb({
      host: u.hostname.replace(/^\[|\]$/g, ""),
      port: u.port ? Number(u.port) : 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password || ""),
      database: decodeURIComponent(u.pathname.replace(/^\//, "")),
      connectionLimit: 5,
      minimumIdle: 0,
      connectTimeout: 3_000,
      acquireTimeout: 5_000,
      socketTimeout: 20_000,
      queryTimeout: 15_000,
    });
  }
  return new PrismaLibSql({ url: raw });
}

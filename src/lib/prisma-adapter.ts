import path from "node:path";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
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
export type DriverAdapter = PrismaLibSQL | PrismaMariaDb;

export function isMysqlUrl(raw: string): boolean {
  return /^mysql:\/\//i.test(raw);
}

/** Resolve relative `file:` paths against the process working directory. */
export function resolveLibSqlUrl(raw: string): string {
  if (raw.startsWith("file:")) {
    const filePart = raw.slice("file:".length);
    const abs = path.isAbsolute(filePart) ? filePart : path.resolve(process.cwd(), filePart);
    return `file:${abs}`;
  }
  return raw;
}

/** Build the driver adapter matching the given (or ambient) DATABASE_URL. */
export function createDriverAdapter(rawUrl?: string): DriverAdapter {
  const raw = rawUrl?.trim() || process.env.DATABASE_URL?.trim() || "file:./db/custom.db";
  if (isMysqlUrl(raw)) {
    const u = new URL(raw);
    return new PrismaMariaDb({
      host: u.hostname || "localhost",
      port: u.port ? Number(u.port) : 3306,
      user: decodeURIComponent(u.username || "root"),
      password: decodeURIComponent(u.password || ""),
      database: decodeURIComponent(u.pathname.replace(/^\//, "")),
      connectionLimit: 5,
    });
  }
  return new PrismaLibSQL({ url: resolveLibSqlUrl(raw) });
}

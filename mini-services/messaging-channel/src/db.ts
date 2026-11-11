import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import path from 'node:path';
import { config } from './config';

// The schema uses engine = "client" (driver-adapter mode), so every client
// must be constructed with a driver adapter chosen from DATABASE_URL:
// mysql:// → MariaDb (production), file:/libsql: → LibSQL (development).
function resolveUrl(raw: string): string {
  if (raw.startsWith('file:')) {
    const filePart = raw.slice('file:'.length);
    const abs = path.isAbsolute(filePart) ? filePart : path.resolve(process.cwd(), filePart);
    return `file:${abs}`;
  }
  return raw;
}

function createAdapter() {
  const raw = config.databaseUrl;
  if (/^mysql:\/\//i.test(raw)) {
    const u = new URL(raw);
    return new PrismaMariaDb({
      host: u.hostname || 'localhost',
      port: u.port ? Number(u.port) : 3306,
      user: decodeURIComponent(u.username || 'root'),
      password: decodeURIComponent(u.password || ''),
      database: decodeURIComponent(u.pathname.replace(/^\//, '')),
      connectionLimit: 5,
    });
  }
  return new PrismaLibSQL({ url: resolveUrl(raw) });
}

export const db = new PrismaClient({
  adapter: createAdapter(),
});

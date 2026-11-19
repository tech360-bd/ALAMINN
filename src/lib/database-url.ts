import path from 'node:path';

export function resolveDatabaseUrl(raw = process.env.DATABASE_URL, cwd = process.cwd()): string {
  const mode = process.env.NODE_ENV;
  const source = raw?.trim() || (mode === 'production' ? '' : 'file:./db/custom.db');
  if (!source) throw new Error('DATABASE_URL is required in production');
  if (source.startsWith('file:')) {
    const file = source.slice(5);
    if (!file || /[\u0000\r\n?#]/.test(file) || (mode === 'production' && !path.isAbsolute(file))) {
      throw new Error('Specify a database file path; production requires an absolute path');
    }
    return `file:${path.resolve(cwd, file)}`;
  }
  let url: URL;
  try { url = new URL(source); } catch { throw new Error('Invalid DATABASE_URL'); }
  if (!['mysql:', 'libsql:', 'http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('Unsupported database URL');
  if (url.protocol === 'mysql:' && (!url.username || url.pathname.length < 2 || url.search || url.hash)) {
    throw new Error('MariaDB connection requires an explicit user and database; URL options are not supported by the runtime adapter');
  }
  if (mode !== 'production' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      process.env.ALAMINN_ALLOW_DEVELOPMENT_NETWORK_DB !== '1') {
    throw new Error('Remote development database requires explicit opt-in');
  }
  return source;
}

export function migrationDatabaseUrl(provider: 'sqlite' | 'mysql'): string {
  const url = resolveDatabaseUrl();
  if (!(provider === 'sqlite' ? url.startsWith('file:') : url.startsWith('mysql:'))) {
    throw new Error('DATABASE_URL does not match the selected Prisma migration provider');
  }
  if (process.env.NODE_ENV === 'production' && process.argv.some((arg) => ['push', 'reset', 'seed', 'dev', 'deploy'].includes(arg))) {
    throw new Error('Use the approved packaged release workflow for production migrations');
  }
  return url;
}

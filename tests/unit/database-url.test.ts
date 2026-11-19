import { afterEach, expect, it, vi } from 'vitest';
import { migrationDatabaseUrl, resolveDatabaseUrl } from '@/lib/database-url';
afterEach(() => vi.unstubAllEnvs());
it('resolves relative local SQLite but requires an explicit stable production path', () => {
  vi.stubEnv('DATABASE_URL', undefined);
  vi.stubEnv('NODE_ENV', 'development');
  expect(resolveDatabaseUrl(undefined, '/check')).toBe('file:/check/db/custom.db');
  vi.stubEnv('NODE_ENV', 'production');
  expect(() => resolveDatabaseUrl()).toThrow('required');
  expect(() => resolveDatabaseUrl('file:./db/custom.db')).toThrow('absolute');
  expect(resolveDatabaseUrl('file:/var/data/live.db')).toBe('file:/var/data/live.db');
});
it('refuses remote dev databases without explicit opt-in and never echoes URLs', () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('ALAMINN_ALLOW_DEVELOPMENT_NETWORK_DB', undefined);
  const candidate = 'mysql://fixture:private@database.example.invalid/integration';
  expect(() => resolveDatabaseUrl(candidate)).toThrow('explicit opt-in');
  expect(resolveDatabaseUrl('mysql://fixture:private@127.0.0.1/integration')).toContain('/integration');
  vi.stubEnv('ALAMINN_ALLOW_DEVELOPMENT_NETWORK_DB', '1');
  expect(resolveDatabaseUrl(candidate)).toBe(candidate);
  expect(() => resolveDatabaseUrl(candidate + '?ssl=true')).toThrow('URL options');
});
it('keeps migration history tied to the selected provider', () => {
  vi.stubEnv('DATABASE_URL', 'file:/tmp/disposable.sqlite');
  expect(migrationDatabaseUrl('sqlite')).toBe('file:/tmp/disposable.sqlite');
  expect(() => migrationDatabaseUrl('mysql')).toThrow('selected Prisma migration provider');
});

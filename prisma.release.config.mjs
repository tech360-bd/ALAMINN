// Migration-only config for the packaged release; runtime env is wired by the
// host service, not copied into the build artifact.
const url = process.env.DATABASE_URL ?? '';
const mysql = url.startsWith('mysql://');
if (!mysql && !url.startsWith('file:/')) throw new Error('Release requires an explicit absolute SQLite or MySQL DATABASE_URL');

const releaseConfig = {
  schema: mysql ? './prisma/schema.mysql.prisma' : './prisma/schema.prisma',
  datasource: { url },
  migrations: { path: mysql ? './prisma/migrations/mysql' : './prisma/migrations/sqlite' },
};

export default releaseConfig;

import { backup, DatabaseSync } from 'node:sqlite';
import { createWriteStream, createReadStream } from 'node:fs';
import { chmod, link, mkdtemp, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { once } from 'node:events';
import { auditMaria, auditSqlite, mariadbOptions, mariadbQuery } from './database-catalog.mjs';

const [output, approval, ...extra] = process.argv.slice(2);
const source = process.env.DATABASE_URL ?? '';
if (extra.length || !output || !source || ((process.env.NODE_ENV === 'production' || source.startsWith('mysql:')) && approval !== '--approved')) {
  throw new Error('Specify the database and output path; production or network backups require explicit authorization');
}
const temp = await mkdtemp(join(dirname(output), '.predeploy-backup-'));
const pending = join(temp, 'pending');

async function transfer(program, config, args, stream, dump) {
  const child = spawn(program, [...config.args, ...args], { env: config.env, stdio: [dump ? 'ignore' : 'pipe', dump ? 'pipe' : 'ignore', 'ignore'] });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 10 * 60_000);
  timeout.unref();
  const done = once(child, 'close').then(([code]) => { if (code !== 0) throw new Error(`${program} failed`); });
  try {
    await Promise.all([done, dump ? pipeline(child.stdout, createGzip(), stream) : pipeline(stream, createGunzip(), child.stdin)]);
  } catch (error) {
    child.kill();
    throw error;
  } finally { clearTimeout(timeout); }
}

async function publish(suffix) {
  await chmod(pending, 0o600);
  // Hard-link atomically without replacing any existing verified backup.
  await link(pending, `${output}.${suffix}`);
}

let stage = 'source validation';
try {
  if (source.startsWith('file:/')) {
    const path = source.slice(5);
    if (!(await stat(path)).isFile()) throw new Error('SQLite source must be an existing file');
    const live = new DatabaseSync(path, { readOnly: true });
    try { await backup(live, pending); } finally { live.close(); }
    const check = auditSqlite(pending);
    if (!check.integrityOk || check.invalidFKs || !check.tables.includes('User')) throw new Error('SQLite backup integrity or schema check failed');
    await publish('sqlite');
  } else {
    const live = mariadbOptions(source);
    const scratch = mariadbOptions(process.env.BACKUP_VERIFY_DATABASE_URL ?? '');
    // A dedicated, empty database and a distinct restricted account are required for restore testing.
    // The database is never cleared by this script. Operators provision a fresh scratch target for each run.
    if (!scratch.database.startsWith('alaminn_backup_verify_') || scratch.database === live.database || !scratch.username || scratch.username === live.username) throw new Error('A separate scratch restore database is required');
    stage = 'scratch grants';
    const grants = mariadbQuery(scratch, 'SHOW GRANTS;', { raw: true }).flat();
    // In schema-level MariaDB grants, an unescaped underscore is a wildcard.
    const literalSchema = scratch.database.replaceAll('_', '\\_');
    const scope = ` ON \`${literalSchema}\`.* TO `;
    if (!grants.some((grant) => grant.includes(scope)) || grants.some((grant) =>
      grant.includes('WITH GRANT OPTION') || (!grant.startsWith('GRANT USAGE ON *.* TO ') &&
        (!/^GRANT [A-Z ,]+ ON /.test(grant) || !grant.slice(0, grant.indexOf(' TO ') + 4).endsWith(scope))))) {
      throw new Error('Scratch account must not have privileges outside its verification database');
    }
    stage = 'scratch emptiness';
    if (mariadbQuery(scratch, 'SHOW FULL TABLES;').length) throw new Error('Scratch restore database must be empty');
    stage = 'source metadata';
    const expected = auditMaria(live, {deep: false});
    stage = 'MariaDB dump';
    await transfer('mariadb-dump', live, ['--single-transaction', '--quick', '--skip-lock-tables', '--no-tablespaces', '--hex-blob', live.database], createWriteStream(pending, { mode: 0o600 }), true);
    stage = 'scratch restore';
    await transfer('mariadb', scratch, [], createReadStream(pending), false);
    stage = 'restored catalog';
    const restored = auditMaria(scratch);
    if (!restored.integrityOk || restored.invalidFKs || !restored.tables.includes('User') || restored.schemaDigest !== expected.schemaDigest) {
      throw new Error('MariaDB scratch integrity or catalog mismatch');
    }
    console.log(`Verified restored MariaDB catalog, integrity and references for ${restored.tables.length} tables.`);
    stage = 'MariaDB artifact publication';
    await publish('sql.gz');
  }
  console.log('Database backup created and independently reopened or restored.');
} catch {
  console.error(`${process.env.GITHUB_ACTIONS === 'true' ? '::error::' : ''}Database backup failed during ${stage}; release must not continue.`);
  process.exitCode = 1;
} finally {
  await rm(temp, { recursive: true, force: true });
}

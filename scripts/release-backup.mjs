import { backup, DatabaseSync } from 'node:sqlite';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { once } from 'node:events';

const [output] = process.argv.slice(2);
const source = process.env.DATABASE_URL ?? '';
if (!output || !source) throw new Error('An explicit database and output path are required');
const temp = await mkdtemp(join(dirname(output), '.predeploy-backup-'));
const pending = join(temp, 'pending');

function sqlOptions(value) {
  const u = new URL(value);
  const database = decodeURIComponent(u.pathname.slice(1));
  if (u.protocol !== 'mysql:' || !/^[a-zA-Z0-9_]+$/.test(database) || u.search || u.hash) throw new Error('Unexpected MariaDB URL configuration');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  return { database, host, port: u.port || '3306',
    args: ['--protocol=tcp', `--host=${host}`, `--port=${u.port || '3306'}`, `--user=${decodeURIComponent(u.username)}`],
    env: { ...process.env, MYSQL_PWD: decodeURIComponent(u.password) },
  };
}
function run(program, config, args) {
  const result = spawnSync(program, [...config.args, ...args], { env: config.env, encoding: 'utf8', timeout: 60_000 });
  if (result.status !== 0) throw new Error(`${program} verification failed`);
  return result.stdout.trim();
}
async function transfer(program, config, args, stream, dump) {
  const child = spawn(program, [...config.args, ...args], { env: config.env, stdio: [dump ? 'ignore' : 'pipe', dump ? 'pipe' : 'ignore', 'ignore'] });
  const done = once(child, 'close').then(([code]) => { if (code !== 0) throw new Error(`${program} failed`); });
  try {
    await Promise.all([done, dump ? pipeline(child.stdout, createGzip(), stream) : pipeline(stream, createGunzip(), child.stdin)]);
  } catch (error) {
    child.kill();
    throw error;
  }
}

try {
  if (source.startsWith('file:/')) {
    const path = source.slice(5);
    if (!(await stat(path)).isFile()) throw new Error('SQLite source must be an existing file');
    const live = new DatabaseSync(path, { readOnly: true });
    try { await backup(live, pending); } finally { live.close(); }
    const check = new DatabaseSync(pending, { readOnly: true });
    try {
      if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
          check.prepare('PRAGMA foreign_key_check').get() ||
          !check.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='User'").get()) {
        throw new Error('SQLite backup integrity or application schema check failed');
      }
    } finally { check.close(); }
    await rename(pending, `${output}.sqlite`);
  } else {
    const live = sqlOptions(source);
    const scratch = sqlOptions(process.env.BACKUP_VERIFY_DATABASE_URL ?? '');
    // A dedicated, empty database and a distinct restricted account are required for restore testing.
    // The database is never cleared by this script. Operators provision a fresh scratch target for each run.
    if (!scratch.database.startsWith('alaminn_backup_verify_') || scratch.database === live.database) throw new Error('A separate scratch restore database is required');
    if (run('mariadb', scratch, ['--batch', '--skip-column-names', scratch.database, '-e', 'SHOW TABLES'])) throw new Error('Scratch restore database must be empty');
    await transfer('mariadb-dump', live, ['--single-transaction', '--quick', '--skip-lock-tables', '--no-tablespaces', '--hex-blob', live.database], createWriteStream(pending, { mode: 0o600 }), true);
    await transfer('mariadb', scratch, [scratch.database], createReadStream(pending), false);
    run('mariadb', scratch, [scratch.database, '-e', 'SELECT id FROM `User` LIMIT 1']);
    await rename(pending, `${output}.sql.gz`);
  }
  console.log('Database backup created and independently reopened or restored.');
} catch {
  console.error('Database backup or restore verification failed; release must not continue.');
  process.exitCode = 1;
} finally {
  await rm(temp, { recursive: true, force: true });
}

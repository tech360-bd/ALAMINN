/** Read-only database inventory. Never emits row values, credentials or endpoints. */
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const sq = (value) => `"${value.replaceAll('"', '""')}"`;
const my = (value) => '`' + value.replaceAll('`', '``') + '`';

export function mariadbOptions(value) {
  const u = new URL(value);
  const database = decodeURIComponent(u.pathname.slice(1));
  const username = decodeURIComponent(u.username);
  if (u.protocol !== 'mysql:' || !/^[a-zA-Z0-9_]+$/.test(database) || !username || !u.hostname || u.search || u.hash) {
    throw new Error('MariaDB catalog requires an explicit user, host and database');
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  return { database, username, args: ['--no-defaults', '--protocol=tcp', `--host=${host}`, `--port=${u.port || '3306'}`, `--user=${username}`],
    env: { ...process.env, MYSQL_PWD: decodeURIComponent(u.password) } };
}

export function mariadbQuery(config, sql, {raw = false} = {}) {
  const result = spawnSync('mariadb', [...config.args, '--batch', '--skip-column-names', ...(raw ? ['--raw'] : []), config.database], {
    input: sql, env: config.env, encoding: 'utf8', timeout: 90_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error('MariaDB catalog query failed');
  return result.stdout.trimEnd().split('\n').filter(Boolean).map((row) => row.split('\t'));
}

export function auditSqlite(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('BEGIN');
    const rows = db.prepare("SELECT name, type, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    const tables = rows.filter(({type}) => type === 'table').map(({name}) => name);
    const counts = Object.fromEntries(tables.map((table) => [table, Number(db.prepare(`SELECT count(*) AS n FROM ${sq(table)}`).get().n)]));
    const columns = Object.fromEntries(tables.map((table) => [table, db.prepare(`PRAGMA table_xinfo(${sq(table)})`).all()]));
    const fks = Object.fromEntries(tables.map((table) => [table, db.prepare(`PRAGMA foreign_key_list(${sq(table)})`).all()]));
    const indexes = Object.fromEntries(tables.map((table) => [table, db.prepare(`PRAGMA index_list(${sq(table)})`).all().map((index) => ({...index, columns:db.prepare(`PRAGMA index_xinfo(${sq(index.name)})`).all()}))]));
    const integrity = db.prepare('PRAGMA integrity_check').all();
    const invalidFKs = db.prepare('PRAGMA foreign_key_check').all().length;
    const migrations = tables.includes('_prisma_migrations') ? db.prepare('SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations ORDER BY started_at').all() : null;
    return { provider: 'sqlite', schemaDigest: hash(JSON.stringify(rows)), tables, counts, columns, indexes, fks, migrations,
      invalidFKs, integrityOk: integrity.length === 1 && integrity[0].integrity_check === 'ok' };
  } finally { db.close(); }
}

export function auditMaria(config, {deep = true} = {}) {
  const tables = mariadbQuery(config, `SELECT TABLE_NAME,TABLE_TYPE,COALESCE(ENGINE,'') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME;`);
  const columns = mariadbQuery(config, `SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,COALESCE(COLLATION_NAME,'') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION;`);
  const indexes = mariadbQuery(config, `SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COALESCE(SUB_PART,0),INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX;`);
  const fks = mariadbQuery(config, `SELECT k.TABLE_NAME,k.CONSTRAINT_NAME,k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,k.ORDINAL_POSITION,r.UPDATE_RULE,r.DELETE_RULE,(k.REFERENCED_TABLE_SCHEMA=DATABASE()) FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION;`);
  const checks = mariadbQuery(config, `SELECT TABLE_NAME,CONSTRAINT_NAME,CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() ORDER BY TABLE_NAME,CONSTRAINT_NAME;`);
  const names = tables.filter(([,kind]) => kind === 'BASE TABLE').map(([table]) => table);
  const schemaDigest = hash(JSON.stringify([tables, columns, indexes, fks, checks]));
  if (!deep) return {schemaDigest};
  const groups = new Map();
  for (const [table, constraint, col, parent, ref, , , , sameDb] of fks) {
    if (sameDb !== '1') throw new Error('Cross-schema foreign key needs separate review');
    const key = `${table}\u0000${constraint}`;
    if (!groups.has(key)) groups.set(key, {table, parent, pairs: []});
    groups.get(key).pairs.push([col, ref]);
  }
  const queries = names.map((table, index) => `SELECT 'count',${index},COUNT(*) FROM ${my(table)};`);
  // For composite FKs (MATCH SIMPLE), any NULL component exempts the row.
  for (const [i, {table, parent, pairs}] of Array.from(groups.values()).entries()) {
    queries.push(`SELECT 'fk',${i},COUNT(*) FROM ${my(table)} c WHERE ${pairs.map(([col]) => `c.${my(col)} IS NOT NULL`).join(' AND ')} AND NOT EXISTS (SELECT 1 FROM ${my(parent)} p WHERE ${pairs.map(([col, ref]) => `c.${my(col)}=p.${my(ref)}`).join(' AND ')});`);
  }
  const values = mariadbQuery(config, `START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;\n${queries.join('\n')}\nCOMMIT;`);
  const counts = Object.fromEntries(values.filter(([kind]) => kind === 'count').map(([, table, count]) => [names[Number(table)], Number(count)]));
  const invalidFKs = values.filter(([kind]) => kind === 'fk').reduce((sum, [,,value]) => sum + Number(value), 0);
  const integrity = names.length ? mariadbQuery(config, `CHECK TABLE ${names.map(my).join(',')};`) : [];
  const migrations = names.includes('_prisma_migrations') ? mariadbQuery(config, 'SELECT migration_name,checksum,finished_at IS NOT NULL,rolled_back_at IS NOT NULL FROM `_prisma_migrations` ORDER BY started_at;').map(([migration_name, checksum, finished, rolled_back]) => ({migration_name, checksum, finished:Number(finished), rolled_back:Number(rolled_back)})) : null;
  return {provider: 'mysql', tables: names, counts, columns, indexes, fks, checks, migrations, schemaDigest, invalidFKs,
    integrityOk: names.length > 0 && integrity.length === names.length && integrity.every(([, , type, msg]) => type === 'status' && msg === 'OK') };
}

export function migrationHistory(provider, migrations, root = 'prisma/migrations') {
  const folder = resolve(root, provider);
  const all = readdirSync(folder, {withFileTypes:true}).filter((item) => item.isDirectory()).map((item) => item.name).sort();
  const entries = Object.fromEntries(all.map((name) => [name, hash(readFileSync(resolve(folder, name, 'migration.sql')))]));
  const active = (migrations ?? []).filter((row) => !row.rolled_back);
  return { present: migrations !== null, expected: entries, pending: all.filter((name) => !active.some((row) => row.migration_name === name && row.finished)),
    failed: active.filter((row) => !row.finished).map((row) => row.migration_name),
    unexpected: active.filter((row) => !entries[row.migration_name]).map((row) => row.migration_name),
    checksumMismatches: active.filter((row) => entries[row.migration_name] !== row.checksum).map((row) => row.migration_name),
    duplicateActive: active.length - new Set(active.map((row) => row.migration_name)).size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const url = process.env.DATABASE_URL ?? '';
    if ((process.env.NODE_ENV === 'production' || url.startsWith('mysql:')) && process.argv[2] !== '--approved-read-only') throw new Error('Read-only audit requires explicit target approval');
    const report = url.startsWith('file:/') ? auditSqlite(url.slice(5)) : auditMaria(mariadbOptions(url));
    const history = migrationHistory(report.provider, report.migrations);
    // Do not print DEFAULT expressions or arbitrary stored data in public logs.
    console.log(JSON.stringify({provider: report.provider, schemaDigest: report.schemaDigest, tables: report.tables.length,
      rows: Object.values(report.counts).reduce((sum, count) => sum + count, 0), invalidFKs: report.invalidFKs, integrityOk: report.integrityOk, history}, null, 2));
    if (!report.integrityOk || report.invalidFKs || !history.present || history.pending.length || history.failed.length || history.unexpected.length || history.checksumMismatches.length || history.duplicateActive) process.exitCode = 1;
  } catch { console.error('Database audit failed; confirm explicit connection, access and integrity'); process.exitCode = 1; }
}

/** Rehearse SQLite recovery into a new, private temporary directory only. */
import { backup, DatabaseSync } from 'node:sqlite';
import { mkdtemp, chmod, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditSqlite } from './database-catalog.mjs';

async function main() {
  const [artifact, ...extra] = process.argv.slice(2);
  if (!artifact || extra.length || !/\.(sqlite|db)$/.test(artifact) || !(await stat(artifact)).isFile()) {
    throw new Error('Provide one existing SQLite backup. MariaDB restoration is verified during db:backup.');
  }
  const snapshot = auditSqlite(artifact);
  if (!snapshot.integrityOk || snapshot.invalidFKs || !snapshot.tables.includes('User')) throw new Error('Invalid SQLite backup');
  const directory = await mkdtemp(join(tmpdir(), 'alaminn-restore-'));
  const file = join(directory, 'restored.sqlite');
  try {
    const source = new DatabaseSync(artifact, { readOnly: true });
    try { await backup(source, file); } finally { source.close(); }
    await chmod(file, 0o600);
    const recovered = auditSqlite(file);
    if (!recovered.integrityOk || recovered.invalidFKs || recovered.schemaDigest !== snapshot.schemaDigest ||
        JSON.stringify(recovered.counts) !== JSON.stringify(snapshot.counts)) throw new Error('SQLite restore did not match the backup');
    console.log(`Restored and verified ${recovered.tables.length} tables in isolated file: ${file}`);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
main().catch(() => { console.error('Restore rehearsal failed. No active database was replaced.'); process.exitCode = 1; });

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Always creates a new disposable database; never accepts a destination.
const directory = mkdtempSync(join(tmpdir(), 'alaminn-test-'));
const filename = join(directory, 'test.sqlite');
const db = new DatabaseSync(filename);
const history = new URL('../../prisma/migrations/sqlite/', import.meta.url);
for (const entry of readdirSync(history, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  db.exec(readFileSync(new URL(`${entry.name}/migration.sql`, history), 'utf8'));
}
db.close();
writeFileSync(join(directory, '.disposable-alaminn-test'), '', { mode: 0o600 });
console.log(filename);

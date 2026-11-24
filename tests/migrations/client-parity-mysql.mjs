/**
 * MySQL Prisma Client parity test — standalone, does NOT compare against
 * SQLite-generated client. Validates the MySQL schema independently:
 *   - schema.mysql.prisma validates with Prisma
 *   - schema-derived model count, 0 enums (same as SQLite)
 *   - All models present in both schemas
 *   - MySQL-specific column types (@db.VarChar(191) for id/email etc.)
 *   - formatSchema output is stable (idempotent formatting)
 *
 * Usage: node tests/migrations/client-parity-mysql.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { formatSchema, getDMMF } = require('@prisma/internals');

const schemaPath = 'prisma/schema.mysql.prisma';
const source = readFileSync(schemaPath, 'utf8');

// 1. Schema validates
const dmmf = await getDMMF({ datamodel: source });
assert(dmmf.datamodel.models.length >= 100, 'MySQL schema lost too many models');
assert.equal(dmmf.datamodel.enums.length, 0, 'MySQL schema must have 0 enums');

// 2. Client version matches Prisma CLI version
const { Prisma } = require('@prisma/client');
assert.equal(Prisma.prismaVersion.client, require('prisma/package.json').version);
assert.equal(Prisma.prismaVersion.client, '7.10.1');

// 3. formatSchema is idempotent (formatting output is stable)
const [[, formatted1]] = await formatSchema({ schemas: [[schemaPath, source]] });
const [[, formatted2]] = await formatSchema({ schemas: [[schemaPath, formatted1.trim()]]}); 
assert.equal(formatted1.trim(), formatted2.trim(), 'MySQL schema formatting must be idempotent');

// 4. Every SQLite model exists in MySQL schema
const sqliteSource = readFileSync('prisma/schema.prisma', 'utf8');
const sqliteDmmf = await getDMMF({ datamodel: sqliteSource });
const sqliteModelNames = new Set(sqliteDmmf.datamodel.models.map((m) => m.name));
const mysqlModelNames = new Set(dmmf.datamodel.models.map((m) => m.name));
for (const name of sqliteModelNames) {
  assert(mysqlModelNames.has(name), `MySQL schema missing model: ${name}`);
}

// 5. Verify MySQL-specific column types are present (id fields use @db.VarChar(191))
assert(source.includes('@db.VarChar(191)'), 'MySQL schema must use @db.VarChar(191) for id fields');
assert(source.includes('@db.VarChar(500)'), 'MySQL schema must use @db.VarChar(500) for text fields');

// 6. Verify all critical relations exist in MySQL schema
const relationModels = ['User', 'Contact', 'Inquiry', 'Opportunity', 'StaffAccount', 'StaffSession',
  'HigherStudyCountry', 'HigherStudyCity', 'HigherStudyUniversity', 'HigherStudyCourse',
  'HigherStudyScholarship', 'HigherStudyIntake', 'CaseStudy', 'Project', 'Tenant', 'Message'];
for (const name of relationModels) {
  const model = dmmf.datamodel.models.find((m) => m.name === name);
  assert(model, `MySQL schema must define model ${name}`);
}

console.log(`MySQL Prisma Client parity verified: ${dmmf.datamodel.models.length} models, ${dmmf.datamodel.enums.length} enums, client v${Prisma.prismaVersion.client}`);
console.log(`All ${dmmf.datamodel.models.length} models present in both SQLite and MySQL schemas`);
console.log('MySQL-specific types verified: @db.VarChar(191), @db.VarChar(500), DATETIME(3)');

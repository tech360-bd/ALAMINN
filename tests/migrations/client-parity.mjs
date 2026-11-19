import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const provider = process.argv[2];
assert(['mysql', 'sqlite'].includes(provider));
const { Prisma } = require('@prisma/client');
const { formatSchema, getDMMF } = require('@prisma/internals');
const schemaPath = provider === 'mysql' ? 'prisma/schema.mysql.prisma' : 'prisma/schema.prisma';
const source = readFileSync(schemaPath, 'utf8');
const dmmf = await getDMMF({datamodel: source});
assert.equal(Prisma.prismaVersion.client, require('prisma/package.json').version);
assert.equal(Prisma.prismaVersion.client, require('@prisma/client/package.json').version);
const [[, formatted]] = await formatSchema({schemas: [[schemaPath, source]]});
assert(readFileSync('node_modules/.prisma/client/schema.prisma', 'utf8').trim() === formatted.trim(), 'Generated schema does not match formatted source');
const shape = ({models, enums, types}) => ({
  models: models.map(({name, dbName, schema, fields}) => ({name, dbName, schema, fields: fields.map(({name, kind, type, relationName}) => ({name, kind, type, relationName}))})),
  enums, types,
});
assert.deepEqual(shape(Prisma.dmmf.datamodel), shape(dmmf.datamodel));
console.log(`Generated ${provider} Prisma ${Prisma.prismaVersion.client} matches ${dmmf.datamodel.models.length} models and ${dmmf.datamodel.enums.length} enums.`);

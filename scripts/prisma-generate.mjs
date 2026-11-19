import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { getGenerators, validate } = require('@prisma/internals');
const { PrismaClientJsGenerator } = require('@prisma/client-generator-js');

// Generate and validate with the matching Prisma WASM schema parser. Database
// migrations still use the provider-specific Prisma CLI and its native engine.
const [command = 'generate', provider = 'sqlite', ...extra] = process.argv.slice(2);
if (!['generate', 'validate'].includes(command) || !['sqlite', 'mysql'].includes(provider) || extra.length) {
  throw new Error('Usage: prisma-generate.mjs [generate|validate] [sqlite|mysql]');
}
const schemaPath = provider === 'mysql' ? 'prisma/schema.mysql.prisma' : 'prisma/schema.prisma';
if (command === 'validate') {
  await validate({ schemas: [[schemaPath, await readFile(schemaPath, 'utf8')]] });
  console.log(`${schemaPath} is valid`);
} else {
  const cliCommand = 'generate';
  const generators = await getGenerators({
    schemaPath,
    registry: { 'prisma-client-js': { type: 'in-process', generator: new PrismaClientJsGenerator({ cliCommand }) } },
    skipDownload: true,
    cliCommand,
  });
  try {
    for (const generator of generators) await generator.generate();
  } finally {
    for (const generator of generators) generator.stop();
  }
}

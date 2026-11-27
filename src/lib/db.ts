import { PrismaClient } from '@prisma/client'
import { createDriverAdapter } from '@/lib/prisma-adapter'
import { loadEnvConfig } from '@/lib/load-env'

// Rule 5: configuration comes from .env.config, loaded before the adapter
// reads DATABASE_URL. Idempotent and safe in every entry point (app, seed, scripts).
loadEnvConfig()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __prismaVersion?: string
}

// Bust cache when schema version changes (forces new client after prisma generate)
const SCHEMA_VERSION = 'v10-university-intel-2026-11'

const cachedVersion = globalForPrisma.__prismaVersion
const cachedPrisma = globalForPrisma.prisma

if (cachedVersion !== SCHEMA_VERSION && cachedPrisma) {
  cachedPrisma.$disconnect().catch(() => {})
  globalForPrisma.prisma = undefined
}

function createPrismaClient(): PrismaClient {
  // engineType = "client" requires a driver adapter; the adapter is chosen
  // from the DATABASE_URL scheme (mysql:// → MariaDb, file:/libsql: → LibSQL).
  const adapter = createDriverAdapter()
  return new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  })
}

export const db =
  globalForPrisma.__prismaVersion === SCHEMA_VERSION && globalForPrisma.prisma
    ? globalForPrisma.prisma
    : createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
  globalForPrisma.__prismaVersion = SCHEMA_VERSION
}

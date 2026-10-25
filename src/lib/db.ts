import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

function isRelationalServerUrl(raw: string): boolean {
  return /^(mysql|postgresql|postgres|sqlserver|cockroachdb):\/\//i.test(raw)
}

function resolveLibSqlUrl(): string {
  const raw = process.env.DATABASE_URL?.trim() || 'file:./db/custom.db'
  if (raw.startsWith('libsql://') || raw.startsWith('https://') || raw.startsWith('http://')) {
    return raw
  }
  if (raw === ':memory:' || raw === 'file::memory:') {
    return ':memory:'
  }
  if (raw.startsWith('file:')) {
    const filePart = raw.slice('file:'.length)
    const absPath = path.isAbsolute(filePart)
      ? filePart
      : path.resolve(process.cwd(), filePart)
    return `file:${absPath}`
  }
  return raw
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __prismaVersion?: string
}

// Bust cache when schema version changes (forces new client after prisma generate)
const SCHEMA_VERSION = 'v7-unorouter-hardened-2026-10'

const cachedVersion = globalForPrisma.__prismaVersion
const cachedPrisma = globalForPrisma.prisma

if (cachedVersion !== SCHEMA_VERSION && cachedPrisma) {
  cachedPrisma.$disconnect().catch(() => {})
  globalForPrisma.prisma = undefined
}

function createPrismaClient(): PrismaClient {
  const rawUrl = process.env.DATABASE_URL?.trim() || 'file:./db/custom.db'
  if (isRelationalServerUrl(rawUrl)) {
    return new PrismaClient({
      log: ['error', 'warn'],
    })
  }
  const adapter = new PrismaLibSQL({ url: resolveLibSqlUrl() })
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

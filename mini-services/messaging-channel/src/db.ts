import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import path from 'node:path';
import { config } from './config';

// The schema uses engine = "client" (driver-adapter mode), so every client
// must be constructed with the libsql adapter — same pattern as the main app.
function resolveUrl(raw: string): string {
  if (raw.startsWith('file:')) {
    const filePart = raw.slice('file:'.length);
    const abs = path.isAbsolute(filePart) ? filePart : path.resolve(process.cwd(), filePart);
    return `file:${abs}`;
  }
  return raw;
}

export const db = new PrismaClient({
  adapter: new PrismaLibSQL({ url: resolveUrl(config.databaseUrl) }),
});

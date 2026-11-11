import { PrismaClient } from '@prisma/client';
import { config } from './config';

export const db = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
});

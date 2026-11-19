import { PrismaClient } from '@prisma/client';
import { createDriverAdapter } from '../../../src/lib/prisma-adapter';
import { config } from './config';

export const db = new PrismaClient({ adapter: createDriverAdapter(config.databaseUrl) });

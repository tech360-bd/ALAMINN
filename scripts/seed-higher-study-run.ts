/**
 * Runner for prisma/seed-higher-study.ts using the app's configured db client
 * (schema.prisma uses engineType = "client", so a driver adapter is required).
 *
 *   DATABASE_URL=file:... NODE_ENV=production npx tsx scripts/seed-higher-study-run.ts
 */
import { loadEnvConfig } from "../src/lib/load-env";
import { PrismaClient } from "@prisma/client";
import { createDriverAdapter } from "../src/lib/prisma-adapter";
import { seedHigherStudy } from "../prisma/seed-higher-study";

loadEnvConfig();

const adapter = createDriverAdapter();
const db = new PrismaClient({ adapter, log: ["error", "warn"] });

async function main() {
  await seedHigherStudy(db);
  console.log("seed-higher-study: done");
  await db.$disconnect();
}

main().catch((e) => {
  console.error("seed-higher-study failed:", e);
  process.exit(1);
});

import { defineConfig } from "prisma/config";
import { loadEnvConfig } from "./src/lib/load-env";

import { migrationDatabaseUrl } from "./src/lib/database-url";

loadEnvConfig();

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: migrationDatabaseUrl("sqlite") },
  migrations: { path: "prisma/migrations/sqlite", seed: "tsx prisma/seed.ts" },
});

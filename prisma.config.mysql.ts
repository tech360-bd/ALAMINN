import { defineConfig } from "prisma/config";
import { loadEnvConfig } from "./src/lib/load-env";

import { migrationDatabaseUrl } from "./src/lib/database-url";

loadEnvConfig();

export default defineConfig({
  schema: "prisma/schema.mysql.prisma",
  datasource: { url: migrationDatabaseUrl("mysql") },
  migrations: { path: "prisma/migrations/mysql", seed: "tsx prisma/seed.ts" },
});

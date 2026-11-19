import { defineConfig, env } from "prisma/config";
import { loadEnvConfig } from "./src/lib/load-env";

loadEnvConfig();

export default defineConfig({
  schema: "prisma/schema.mysql.prisma",
  datasource: { url: env("DATABASE_URL") },
  migrations: { path: "prisma/migrations/mysql", seed: "tsx prisma/seed.ts" },
});

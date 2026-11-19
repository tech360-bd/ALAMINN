import path from "node:path";
import { defineConfig } from "prisma/config";
import { loadEnvConfig } from "./src/lib/load-env";

loadEnvConfig();
const raw = process.env.DATABASE_URL || "file:./db/custom.db";
const url = raw.startsWith("file:") ? `file:${path.resolve(raw.slice(5))}` : raw;

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url },
  migrations: { path: "prisma/migrations/sqlite", seed: "tsx prisma/seed.ts" },
});

import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import { defineConfig } from "prisma/config";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

// Rule 5: load .env.config explicitly (never .env). dotenv.parse does not
// expand `$`, so passwords survive intact.
for (const file of [".env.config.local", ".env.config"]) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) continue;
  const parsed = parse(fs.readFileSync(full));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// The bundled WASM schema engine works without downloading native binaries.
// Keep the CLI and the application on the same libSQL driver.
const raw = process.env.DATABASE_URL || `file:${path.resolve("db/custom.db")}`;
const url = raw.startsWith("file:") && !path.isAbsolute(raw.slice(5))
  ? `file:${path.resolve(raw.slice(5))}`
  : raw;

export default defineConfig({
  schema: "prisma/schema.prisma",
  experimental: { adapter: true },
  migrations: { path: "prisma/migrations/sqlite", seed: "npx tsx prisma/seed.ts" },
  engine: "js",
  adapter: async () => new PrismaLibSQL({ url }),
});

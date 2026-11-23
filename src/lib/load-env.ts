/**
 * .env.config loader (Rule 5 / Rule 9.2).
 * ---------------------------------------
 * This project deliberately does NOT use `.env` or `.env.local`:
 * Next.js expands `$` inside those files, which corrupts passwords and
 * secrets. Configuration lives in `.env.config` and is loaded here.
 *
 * Values are parsed by dotenv's parser in *no-expansion* mode, so a
 * password such as `p$a$ss` is preserved byte-for-byte.
 *
 * Precedence (highest first):
 *   1. Real process environment (PM2 ecosystem passes these explicitly)
 *   2. .env.config.local
 *   3. .env.config
 *
 * Idempotent and safe to call from multiple entry points (next.config.ts,
 * instrumentation.ts, prisma.config.ts, scripts).
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";

let loaded = false;

export function loadEnvConfig(dir: string = process.cwd()): void {
  if (loaded) return;
  loaded = true;

  // Unit tests must control process.env themselves. Vitest sets NODE_ENV=test;
  // LOAD_ENV_CONFIG_IN_TEST=1 opts back in when a test wants the real file.
  if (process.env.NODE_ENV === "test" && process.env.LOAD_ENV_CONFIG_IN_TEST !== "1") {
    return;
  }

  const files = [".env.config.local", ".env.config"];
  for (const file of files) {
    const full = path.join(/*turbopackIgnore: true*/ dir, file);
    try {
      if (!fs.existsSync(/*turbopackIgnore: true*/ full)) continue;
      const parsed = parse(fs.readFileSync(/*turbopackIgnore: true*/ full));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch (err) {
      // Never crash startup because of an unreadable optional env file.
      console.warn(`[load-env] could not read ${file}:`, err instanceof Error ? err.message : err);
    }
  }
}

/** Test helper. */
export function resetEnvConfigLoader(): void {
  loaded = false;
}

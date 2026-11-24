/**
 * .env.config loader (Rule 5 / Rule 9.2).
 * ---------------------------------------
 * This project deliberately does NOT use `.env` / `.env.local` as its
 * canonical configuration: Next.js expands `$` inside those files, which
 * corrupts passwords and secrets. Configuration lives in `.env.config`
 * and is loaded here with dotenv's parser in *no-expansion* mode.
 *
 * Precedence (highest first):
 *   1. Real process environment (PM2 ecosystem / container runtime wins)
 *   2. .env.config.local
 *   3. .env.config
 *   4. .env.local        (legacy fallback — deprecated)
 *   5. .env              (legacy fallback — deprecated)
 *
 * Legacy .env files are loaded only as a fallback when the canonical
 * .env.config files are absent, so existing deployments keep working
 * while operators migrate. A deprecation warning is emitted once.
 *
 * Idempotent and safe to call from multiple entry points (next.config.ts,
 * instrumentation.ts, prisma.config.ts, scripts, server.js via shared logic).
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";

let loaded = false;
let warnedLegacy = false;

const CANONICAL_FILES = [".env.config.local", ".env.config"] as const;
const LEGACY_FILES = [".env.local", ".env"] as const;

export type LoadEnvResult = {
  loaded: string[];
  legacyLoaded: string[];
};

export function loadEnvConfig(dir: string = process.cwd()): LoadEnvResult {
  const result: LoadEnvResult = { loaded: [], legacyLoaded: [] };
  if (loaded) return result;
  loaded = true;

  // Unit tests must control process.env themselves. Vitest sets NODE_ENV=test;
  // LOAD_ENV_CONFIG_IN_TEST=1 opts back in when a test wants the real file.
  if (process.env.NODE_ENV === "test" && process.env.LOAD_ENV_CONFIG_IN_TEST !== "1") {
    return result;
  }

  const canonicalPresent = CANONICAL_FILES.some((file) =>
    fs.existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, file))
  );

  const files: readonly string[] = canonicalPresent
    ? CANONICAL_FILES
    : [...CANONICAL_FILES, ...LEGACY_FILES];

  for (const file of files) {
    const full = path.join(/*turbopackIgnore: true*/ dir, file);
    try {
      if (!fs.existsSync(/*turbopackIgnore: true*/ full)) continue;
      const parsed = parse(fs.readFileSync(/*turbopackIgnore: true*/ full));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
      const isLegacy = (LEGACY_FILES as readonly string[]).includes(file);
      if (isLegacy) result.legacyLoaded.push(file);
      else result.loaded.push(file);
    } catch (err) {
      // Never crash startup because of an unreadable optional env file.
      console.warn(
        `[load-env] could not read ${file}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  if (result.legacyLoaded.length > 0 && !warnedLegacy) {
    warnedLegacy = true;
    console.warn(
      `[load-env] DEPRECATED: loaded legacy env file(s): ${result.legacyLoaded.join(", ")}. ` +
        "Migrate to .env.config / .env.config.local (no $ expansion). " +
        "Canonical precedence: process env > .env.config.local > .env.config > legacy .env files."
    );
  }

  return result;
}

/** Test helper. */
export function resetEnvConfigLoader(): void {
  loaded = false;
  warnedLegacy = false;
}

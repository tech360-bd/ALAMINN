import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Environment documentation honesty gate.
 *
 * Every `process.env.X` referenced by application code (src/ + scripts/)
 * must be documented in .env.example — either as a real entry
 * (`X="..."`) or inside a comment (alias notes like "AUTH_SECRET is a
 * legacy alias"). Variables that are NOT operator-facing (CI-only
 * fixtures, framework-injected, internal guards) are explicitly
 * allowlisted here so the docs stay reviewable and complete.
 */
const REPO_ROOT = process.cwd();

const ALLOWLIST = new Set([
  // Test/CI fixture-only (never set by operators)
  "ALAMINN_TEST_INSTANCE",
  "LOAD_ENV_CONFIG_IN_TEST",
  "TEST_SMTP_PORT",
  "TEST_BASE_URL",
  // Injected by the framework/runtime — not user-configurable
  "NEXT_RUNTIME",
  "NODE_ENV",
  // Standard GitHub Actions CI marker (scripts/*.mjs ::error:: annotations)
  "GITHUB_ACTIONS",
  // Internal safety guard (documented in its guard module docstring)
  "ALAMINN_ALLOW_DEVELOPMENT_NETWORK_DB",
  // CI-provisioned secrets set per-run in .github/workflows/ci.yml;
  // production equivalents (JWT_SECRET, ADMIN_PASSWORD) are documented.
  "STAFF_BOOTSTRAP_PASSWORD",
]);

function* walkTsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkTsFiles(full);
    else if (/\.(ts|tsx|mjs)$/.test(entry.name)) yield full;
  }
}

describe("environment documentation honesty", () => {
  it("documents every operator-facing process.env variable in .env.example", () => {
    const envExample = readFileSync(join(REPO_ROOT, ".env.example"), "utf8");

    const used = new Set<string>();
    for (const dir of ["src", "scripts"]) {
      for (const file of walkTsFiles(join(REPO_ROOT, dir))) {
        const content = readFileSync(file, "utf8");
        for (const m of content.matchAll(/process\.env\.([A-Z_0-9]+)/g)) {
          used.add(m[1]);
        }
      }
    }

    const missing: string[] = [];
    for (const name of [...used].sort()) {
      if (ALLOWLIST.has(name)) continue;
      if (!envExample.includes(name)) missing.push(name);
    }
    expect(missing).toEqual([]);
  });

  it("documents every variable listed in .env.example as actually referenced or intentionally optional", () => {
    // Reverse direction: no ghost docs — every documented key must be
    // referenced somewhere in the codebase (src/scripts/tests) or be an
    // explicitly commented-out optional template line.
    const envExample = readFileSync(join(REPO_ROOT, ".env.example"), "utf8");
    const documented = [...envExample.matchAll(/^([A-Z_0-9]+)=/gm)].map((m) => m[1]);

    let corpus = "";
    for (const dir of ["src", "scripts", "tests"]) {
      for (const file of walkTsFiles(join(REPO_ROOT, dir))) {
        corpus += readFileSync(file, "utf8");
      }
    }

    const ghosts: string[] = [];
    for (const name of documented) {
      if (!corpus.includes(name) && name !== "DATABASE_URL") {
        ghosts.push(name);
      }
    }
    expect(ghosts).toEqual([]);
  });
});

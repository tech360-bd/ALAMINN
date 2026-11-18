#!/usr/bin/env node
/**
 * Environment sanity check (Phase 1).
 * Loads .env.config exactly like the app does, then reports whether the
 * variables required to boot are present. Secrets are never printed —
 * only whether they are set and their length.
 *
 *   npm run env:check
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";

for (const file of [".env.config.local", ".env.config"]) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) continue;
  const parsed = parse(fs.readFileSync(full));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const isProd = process.env.NODE_ENV === "production";

const required = [
  ["DATABASE_URL", false],
  ["JWT_SECRET", true],
];
const recommended = [
  ["SESSION_SECRET", true],
  ["CRON_SECRET", true],
  ["EMAIL_FROM", false],
  ["NEXT_PUBLIC_SITE_URL", false],
  ["OLLAMA_BASE_URL", false],
  ["OLLAMA_MODEL", false],
];

let failures = 0;

function report(name, secret) {
  const value = process.env[name];
  const ok = Boolean(value && value.trim());
  if (!ok) failures++;
  const shown = ok ? `set (${value.length} chars)` : "MISSING";
  console.log(`${ok ? "  ✓" : "  ✗"} ${name.padEnd(22)} ${secret ? shown : value ?? ""}`);
}

console.log(`\n[env:check] NODE_ENV=${process.env.NODE_ENV ?? "(unset)"}  mode=${isProd ? "production" : "development"}\n`);
console.log("Required:");
for (const [name, secret] of required) report(name, secret);

console.log("\nRecommended:");
for (const [name, secret] of recommended) report(name, secret);

const jwt = process.env.JWT_SECRET ?? process.env.AUTH_SECRET ?? "";
if (jwt && jwt.length < 32) {
  console.log("\n  ✗ JWT_SECRET must be at least 32 chars.");
  failures++;
}

const source = fs.existsSync(path.resolve(process.cwd(), ".env.config"))
  ? ".env.config"
  : "(no .env.config found — using process environment only)";
console.log(`\nConfig source: ${source}`);

if (failures > 0) {
  console.error(`\n[env:check] ${failures} problem(s) found.\n`);
  process.exit(1);
}
console.log("\n[env:check] OK\n");

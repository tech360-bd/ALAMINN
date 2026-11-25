/**
 * server.js — Production entry point (cPanel Node.js App + VPS).
 * ----------------------------------------------------------------------------
 * This file is the "Application startup file" for cPanel's "Setup Node.js App"
 * UI and also works as a plain `node server.js` entry on a VPS.
 *
 * It does:
 *   1. Loads environment configuration with the SAME precedence as the
 *      Next.js app (src/lib/load-env.ts): process env > .env.config.local >
 *      .env.config > legacy .env.local/.env fallback. Uses dotenv.parse in
 *      no-expansion mode so `$` in secrets is preserved byte-for-byte.
 *   2. Ensures NODE_ENV=production is set.
 *   3. Validates that the standalone build exists.
 *   4. Installs graceful shutdown handlers (SIGTERM, SIGINT) for clean exits
 *      under systemd / PM2 / Docker / cPanel Passenger.
 *   5. Boots the Next.js standalone server at `.next/standalone/server.js`.
 *
 * Canonical env file: .env.config (see .env.config.example).
 * Legacy .env is supported only as a fallback with a deprecation warning.
 *
 * cPanel setup:
 *   Application root:          /home/<user>/alaminn.info
 *   Application startup file:  server.js
 *   .env.config location:      /home/<user>/alaminn.info/.env.config  (secure)
 *
 * VPS / standalone:
 *   NODE_ENV=production node server.js
 */
"use strict";

process.env.NODE_ENV = process.env.NODE_ENV || "production";

const path = require("path");
const fs = require("fs");

// dotenv is optional in minimal container images where Next's standalone
// output does not trace it; there, orchestrator-supplied env vars (docker -e,
// systemd Environment=, PM2 env) make env-file parsing unnecessary. On
// bare-metal installs dotenv is a regular dependency and .env.config loads.
let dotenvParse = null;
try {
  dotenvParse = require("dotenv").parse;
} catch {
  console.warn(
    "[alaminn.info] dotenv module unavailable; skipping env-file parsing " +
      "(relying on orchestrator-supplied environment variables)."
  );
}

// ── 1. Load env with canonical precedence (no $ expansion) ──────────────────
const CANONICAL_FILES = [".env.config.local", ".env.config"];
const LEGACY_FILES = [".env.local", ".env"];
const canonicalPresent = CANONICAL_FILES.some((file) =>
  fs.existsSync(path.join(__dirname, file))
);
const envFiles = canonicalPresent
  ? CANONICAL_FILES
  : [...CANONICAL_FILES, ...LEGACY_FILES];
const legacyLoaded = [];

if (dotenvParse) {
  for (const file of envFiles) {
    const envPath = path.join(__dirname, file);
    if (!fs.existsSync(envPath)) continue;
    try {
      const parsed = dotenvParse(fs.readFileSync(envPath));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
      if (LEGACY_FILES.includes(file)) legacyLoaded.push(file);
    } catch (err) {
      console.warn(
        `[alaminn.info] could not read ${file}:`,
        err && err.message ? err.message : err
      );
    }
  }
}

if (legacyLoaded.length > 0) {
  console.warn(
    `[alaminn.info] DEPRECATED: loaded legacy env file(s): ${legacyLoaded.join(", ")}. ` +
      "Migrate to .env.config / .env.config.local (no $ expansion)."
  );
}

// ── 1b. Production runtime configuration validation (fail fast, no secrets) ─
function validateRuntimeEnv() {
  if (process.env.NODE_ENV !== "production") return;
  const errors = [];
  const warnings = [];

  const jwt = process.env.JWT_SECRET || process.env.AUTH_SECRET || "";
  if (Buffer.byteLength(jwt, "utf8") < 32) {
    errors.push(
      "JWT_SECRET (or AUTH_SECRET) must be set to a random value of at least 32 bytes."
    );
  }

  const session = process.env.SESSION_SECRET || "";
  if (session && Buffer.byteLength(session, "utf8") < 32) {
    errors.push("SESSION_SECRET is set but must be at least 32 bytes when provided.");
  } else if (!session) {
    warnings.push(
      "SESSION_SECRET is not set; staff session routes will fail closed in production."
    );
  }

  if (!process.env.CRON_SECRET) {
    warnings.push("CRON_SECRET is not set; scheduled cron endpoints will reject requests.");
  }

  if (!process.env.DATABASE_URL) {
    warnings.push("DATABASE_URL is not set; runtime will use its configured default/fail-fast behavior.");
  }

  for (const w of warnings) console.warn(`[alaminn.info] CONFIG WARNING: ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`[alaminn.info] CONFIG ERROR: ${e}`);
    console.error(
      "[alaminn.info] Refusing to start with unsafe production configuration. " +
        "Set required secrets in .env.config or deployment environment."
    );
    process.exit(1);
  }
}
validateRuntimeEnv();

// ── 2. Locate the Next.js standalone server ────────────────────────────────
const standaloneCandidates = [
  path.join(__dirname, "server.standalone.js"), // Docker runtime wrapper layout
  path.join(__dirname, ".next", "standalone", "server.js"), // local/VPS standalone build
];
const standalonePath = standaloneCandidates.find((p) => fs.existsSync(p));

if (!standalonePath) {
  console.error(
    "[alaminn.info] FATAL: Next.js standalone server not found. Checked:\n" +
      standaloneCandidates.map((p) => `  - ${p}`).join("\n") +
      "\nRun `npm install` then `npm run build` before starting the app."
  );
  process.exit(1);
}

// ── 3. Graceful shutdown handlers ──────────────────────────────────────────
// The standalone Next.js server registers its own signal handlers. We add a
// bounded safety-net exit so the process cannot hang forever if shutdown stalls.
// We intentionally do NOT force-exit immediately; the timeout is a last resort.
let shuttingDown = false;
function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[alaminn.info] Received ${signal}, shutting down gracefully...`);
  const timeout = setTimeout(() => {
    console.error("[alaminn.info] Forcing exit after graceful-shutdown timeout.");
    process.exit(1);
  }, 10000);
  // Allow the process to exit naturally if all handles close before timeout.
  if (typeof timeout.unref === "function") timeout.unref();
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ── 4. Hand off to the Next.js standalone server ───────────────────────────
// Next.js standalone reads process.env.PORT and process.env.HOSTNAME.
require(standalonePath);

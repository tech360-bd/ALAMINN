#!/usr/bin/env node
/**
 * Live verification of alaminn.info after PR #106 deploy.
 *
 * Two probe engines:
 *   - "browser": real Chromium via Playwright — best for https://alaminn.info,
 *     where Cloudflare bot management challenges non-browser TLS fingerprints
 *     (curl-style probes get 503).
 *   - "http":    plain HTTP probes via native fetch (Node >= 18) with a
 *     node:http/https fallback for older runtimes — zero external deps, so
 *     route verification works on any host, any user, no /home/z paths.
 *
 * Playwright is resolved DYNAMICALLY (never hardcoded):
 *   1. $PLAYWRIGHT_PATH (explicit override)
 *   2. require("playwright") from the repo's local node_modules
 *   3. require("playwright-core") likewise
 *   4. the global npm root (`npm root -g`, e.g. ~/.npm-global/lib/node_modules)
 *
 * Usage:
 *   node scripts/verify-intel-live.js                                   # auto engine, http://127.0.0.1:3012
 *   node scripts/verify-intel-live.js --http-only                       # force HTTP engine
 *   node scripts/verify-intel-live.js --browser                         # force Playwright (exit 2 if missing)
 *   node scripts/verify-intel-live.js --base-url https://alaminn.info
 *   INTEL_BASE_URL=http://127.0.0.1:3012 node scripts/verify-intel-live.js
 *   node scripts/verify-intel-live.js --attempts 1                      # faster probes (default 3)
 *
 * Exit codes: 0 = all pass, 1 = route failures, 2 = fatal (bad args / engine unavailable).
 */
"use strict";

const path = require("path");
const http = require("http");
const https = require("https");
const { execFileSync } = require("child_process");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 30000;
const RETRY_DELAY_503_MS = 2500;
const RETRY_DELAY_ERROR_MS = 2000;

// Routes are kept as exact literal strings inside a single array and are
// appended to the base URL with plain string concatenation (never re-parsed
// through URL/path helpers), so no path can be mangled during probing.
const ROUTES = [
  { path: "/", expect: 200, label: "homepage" },
  { path: "/api/health", expect: 200, label: "health" },
  { path: "/admin", expect: [200, 307], label: "admin root" },
  { path: "/admin/higher-study", expect: 200, label: "admin higher-study index (new section link)" },
  { path: "/admin/higher-study/intelligence", expect: 200, label: "NEW admin intelligence dashboard" },
  { path: "/admin/higher-study/monitoring", expect: 200, label: "admin monitoring (existing)" },
  { path: "/admin/higher-study/universities", expect: 200, label: "admin universities" },
  { path: "/admin/higher-study/courses", expect: 200, label: "admin courses" },
  { path: "/admin/automation", expect: 200, label: "admin automation (existing)" },
  { path: "/admin/crm", expect: 200, label: "admin crm (existing)" },
  { path: "/api/cron/university-intelligence", expect: 401, label: "NEW cron endpoint (401 without secret)" },
  { path: "/api/cron/higher-study-monitor", expect: 401, label: "existing cron (401 without secret)" },
  { path: "/api/v1/higher-study/admin/intelligence", expect: 401, label: "NEW admin intelligence API (401 anonymous)" },
  { path: "/api/v1/higher-study/admin/intelligence/sources", expect: 401, label: "NEW sources API (401)" },
  { path: "/api/v1/higher-study/admin/intelligence/evidence", expect: 401, label: "NEW evidence API (401)" },
  { path: "/api/v1/higher-study/admin/intelligence/conflicts", expect: 401, label: "NEW conflicts API (401)" },
  { path: "/api/v1/higher-study/admin/intelligence/duplicates", expect: 401, label: "NEW duplicates API (401)" },
  { path: "/api/v1/higher-study/admin/intelligence/jobs", expect: 401, label: "NEW jobs API (401)" },
  { path: "/api/v1/higher-study/admin/intelligence/tasks", expect: 401, label: "NEW tasks API (401)" },
  { path: "/api/v1/higher-study/admin/intelligence/export", expect: 401, label: "NEW export API (401)" },
];

// Course directory with an existing slug (verification trail renders when evidence exists)
const EXTRA_ROUTE = { path: "/higher-study/course-finder", expect: 200, label: "student directory" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CLI / environment ────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { httpOnly: false, forceBrowser: false, baseUrl: null, attempts: 3, unknown: [] };
  const bool = (v) => v === undefined || ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
  for (let i = 0; i < argv.length; i++) {
    const [flag, inlineVal] = String(argv[i]).split("=");
    const next = () => (inlineVal !== undefined ? inlineVal : argv[++i]);
    switch (flag) {
      case "--http-only":
        out.httpOnly = bool(inlineVal);
        break;
      case "--browser":
        out.forceBrowser = bool(inlineVal);
        break;
      case "--base-url":
      case "--baseUrl": {
        const v = next();
        if (v) out.baseUrl = v;
        break;
      }
      case "--attempts": {
        const v = parseInt(next(), 10);
        if (Number.isFinite(v) && v >= 1) out.attempts = Math.min(v, 10);
        break;
      }
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        out.unknown.push(String(argv[i]));
    }
  }
  return out;
}

function resolveBase(raw) {
  const candidate = (raw || "").trim();
  if (!candidate) throw new Error("empty base URL");
  let u;
  try {
    u = new URL(candidate);
  } catch {
    throw new Error(`invalid base URL "${candidate}" (expected http:// or https:// origin)`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`unsupported protocol "${u.protocol}" (expected http: or https:)`);
  }
  // Preserve an optional path prefix, strip trailing slashes; route paths
  // already start with "/" so plain concatenation stays intact.
  return u.origin + u.pathname.replace(/\/+$/, "");
}

// ── Playwright resolution (portable — no hardcoded paths) ────────────────
function loadPlaywright() {
  const tried = [];
  const tryRequire = (id) => {
    tried.push(id);
    try {
      return require(id);
    } catch {
      return null;
    }
  };
  let pw = null;
  if (process.env.PLAYWRIGHT_PATH) pw = tryRequire(process.env.PLAYWRIGHT_PATH);
  if (!pw) pw = tryRequire("playwright"); // local node_modules (walks up from this file)
  if (!pw) pw = tryRequire("playwright-core");
  if (!pw) {
    try {
      const globalRoot = execFileSync("npm", ["root", "-g"], {
        encoding: "utf8",
        timeout: 15000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (globalRoot) {
        for (const pkg of ["playwright", "playwright-core"]) {
          pw = tryRequire(path.join(globalRoot, pkg));
          if (pw) break;
        }
      }
    } catch {
      // npm unavailable — ignore, fall through to null
    }
  }
  pw.__tried = tried; // for diagnostics only
  return pw;
}

// ── HTTP probing ─────────────────────────────────────────────────────────
function legacyRequest(url, timeoutMs) {
  // Node < 18 (no global fetch): minimal GET via node:http/https.
  // Redirects are NOT followed, so 3xx statuses surface verbatim.
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https:") ? https : http;
    const req = mod.get(
      url,
      { headers: { "user-agent": UA, accept: "*/*" }, timeout: timeoutMs },
      (res) => {
        let body = "";
        res.on("data", (d) => {
          if (body.length < 4096) body += d;
        });
        res.on("end", () => resolve({ status: res.statusCode || 0, body: body.slice(0, 120) }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
  });
}

async function fetchRequest(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "manual", // keep 307 etc. visible instead of auto-following
      signal: ctrl.signal,
      headers: { "user-agent": UA, accept: "*/*" },
    });
    let body = "";
    try {
      body = (await res.text()).slice(0, 120);
    } catch {
      // empty/aborted body — ignore
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function probeHttp(base, routePath, attempts) {
  const url = base + routePath; // exact string concat — no path mangling
  let lastErr = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = typeof fetch === "function" ? await fetchRequest(url, REQUEST_TIMEOUT_MS) : await legacyRequest(url, REQUEST_TIMEOUT_MS);
      if (res.status === 503 && attempt < attempts) {
        await sleep(RETRY_DELAY_503_MS); // likely a challenge/retry
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < attempts) await sleep(RETRY_DELAY_ERROR_MS);
    }
  }
  return { status: -1, body: "", error: lastErr ? String(lastErr.message || lastErr) : "unreachable" };
}

// ── Browser probing ──────────────────────────────────────────────────────
async function probeBrowser(page, base, route, attempts) {
  let status = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const resp = await page.goto(base + route.path, { waitUntil: "domcontentloaded", timeout: REQUEST_TIMEOUT_MS });
      status = resp ? resp.status() : 0;
      if (status === 503 && attempt < attempts) {
        await page.waitForTimeout(RETRY_DELAY_503_MS); // challenge/retry
        continue;
      }
      break;
    } catch {
      status = -1;
      if (attempt < attempts) await page.waitForTimeout(RETRY_DELAY_ERROR_MS);
    }
  }
  return status;
}

// ── Runner ───────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/verify-intel-live.js [--http-only] [--browser] [--base-url URL] [--attempts N]");
    process.exit(0);
  }
  if (args.unknown.length) {
    console.log(`NOTE: ignoring unrecognised argument(s): ${args.unknown.join(" ")}`);
  }

  let base;
  try {
    base = resolveBase(args.baseUrl || process.env.INTEL_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:3012");
  } catch (e) {
    console.error(`FATAL ${e.message}`);
    process.exit(2);
  }

  // Engine selection: --browser forces Playwright; --http-only forces HTTP;
  // otherwise use Playwright when resolvable and fall back to HTTP cleanly.
  let engine = "http";
  let pw = null;
  if (args.httpOnly && args.forceBrowser) {
    console.error("FATAL --http-only and --browser are mutually exclusive");
    process.exit(2);
  }
  if (args.forceBrowser) {
    pw = loadPlaywright();
    if (!pw) {
      console.error("FATAL --browser requested but Playwright is not installed.");
      console.error("      Install it with: npm i -D playwright && npx playwright install chromium");
      console.error("      Or probe without a browser: node scripts/verify-intel-live.js --http-only");
      process.exit(2);
    }
    engine = "browser";
  } else if (!args.httpOnly) {
    pw = loadPlaywright();
    if (pw) engine = "browser";
    else console.log("playwright not found — automatic fallback to HTTP engine (native fetch).");
  }

  console.log(`Engine: ${engine}${engine === "browser" ? " (Playwright Chromium)" : " (HTTP probes)"}`);
  console.log(`Base:   ${base}`);
  console.log(`Routes: ${ROUTES.length + 1} (attempts per route: ${args.attempts})`);
  console.log("");

  const allRoutes = [...ROUTES, EXTRA_ROUTE];
  const results = [];

  if (engine === "browser") {
    const { chromium } = pw;
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    try {
      const context = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 } });
      const page = await context.newPage();
      for (const r of allRoutes) {
        const status = await probeBrowser(page, base, r, args.attempts);
        const body =
          r.path === "/api/health" && status === 200
            ? String(await page.textContent("body").catch(() => "")).slice(0, 120)
            : "";
        results.push({ route: r, status, body, finalUrl: page.url() });
      }
    } finally {
      await browser.close().catch(() => {});
    }
  } else {
    for (const r of allRoutes) {
      const res = await probeHttp(base, r.path, args.attempts);
      results.push({ route: r, status: res.status, body: res.body || "", error: res.error });
    }
  }

  let pass = 0;
  const failures = [];
  let saw503 = false;
  for (const { route: r, status, body, error } of results) {
    const expected = Array.isArray(r.expect) ? r.expect : [r.expect];
    const ok = expected.includes(status);
    if (ok) pass++;
    else failures.push(`${r.path} -> ${status}${error ? ` (${error})` : ""} (expected ${expected.join("|")})`);
    if (status === 503) saw503 = true;
    console.log(`${ok ? "PASS" : "FAIL"} ${status} ${r.path} — ${r.label}${status === 503 ? " (challenge page)" : ""}`);
    if (r.path === "/api/health" && ok && body) console.log(`      health body: ${body}`);
  }

  console.log(`\nRESULT: ${pass} PASS / ${failures.length} FAIL of ${allRoutes.length} (engine=${engine}, base=${base})`);
  if (failures.length) {
    console.log("FAILURES:");
    failures.forEach((f) => console.log("  - " + f));
  }
  if (saw503 && engine === "http") {
    console.log("HINT: 503 responses suggest a bot-management challenge — install Playwright and rerun with --browser.");
  }
  process.exit(failures.length > 0 ? 1 : 0);
}

// Exported for testability; main() only runs when executed directly.
module.exports = { parseArgs, resolveBase, loadPlaywright, ROUTES, EXTRA_ROUTE, probeHttp };
if (require.main === module) {
  main().catch((e) => {
    console.error("FATAL", e.message);
    process.exit(2);
  });
}

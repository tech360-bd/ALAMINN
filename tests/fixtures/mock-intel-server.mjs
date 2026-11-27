#!/usr/bin/env node
/**
 * Minimal mock of the alaminn.info route surface, used to E2E-test the HTTP
 * engine of scripts/verify-intel-live.js without a real deployment.
 *
 * Usage:
 *   node tests/fixtures/mock-intel-server.mjs [port]        # all routes present
 *   MOCK_MISSING="/admin/higher-study/intelligence" node tests/fixtures/mock-intel-server.mjs [port]
 *
 * Routes listed in MOCK_MISSING respond 404 so the verifier exits 1
 * (failure-path test). Status codes mirror the real app contract verified
 * in PR #106: public/admin pages 200, /admin 307, cron + admin intelligence
 * APIs 401 for anonymous callers.
 */
import http from "node:http";

const PORT = Number(process.argv[2] || process.env.MOCK_PORT || 4599);
const MISSING = new Set(
  (process.env.MOCK_MISSING || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

const ROUTE_STATUS = {
  "/": 200,
  "/api/health": 200,
  "/admin": 307,
  "/admin/higher-study": 200,
  "/admin/higher-study/intelligence": 200,
  "/admin/higher-study/monitoring": 200,
  "/admin/higher-study/universities": 200,
  "/admin/higher-study/courses": 200,
  "/admin/automation": 200,
  "/admin/crm": 200,
  "/api/cron/university-intelligence": 401,
  "/api/cron/higher-study-monitor": 401,
  "/api/v1/higher-study/admin/intelligence": 401,
  "/api/v1/higher-study/admin/intelligence/sources": 401,
  "/api/v1/higher-study/admin/intelligence/evidence": 401,
  "/api/v1/higher-study/admin/intelligence/conflicts": 401,
  "/api/v1/higher-study/admin/intelligence/duplicates": 401,
  "/api/v1/higher-study/admin/intelligence/jobs": 401,
  "/api/v1/higher-study/admin/intelligence/tasks": 401,
  "/api/v1/higher-study/admin/intelligence/export": 401,
  "/higher-study/course-finder": 200,
};

const server = http.createServer((req, res) => {
  const p = (req.url || "/").split("?")[0];
  const status = MISSING.has(p) ? 404 : (ROUTE_STATUS[p] ?? 404);
  let body = "";
  if (p === "/api/health" && status === 200) {
    body = JSON.stringify({ status: "ok", db: "up", time: new Date().toISOString() });
    res.writeHead(status, { "content-type": "application/json" });
  } else if (p === "/admin" && status === 307) {
    res.writeHead(status, { location: "/admin/login" });
  } else {
    res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    body = `<!doctype html><title>mock</title>${p}`;
  }
  res.end(body);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock-intel-server listening on http://127.0.0.1:${PORT} (missing routes: ${MISSING.size})`);
});

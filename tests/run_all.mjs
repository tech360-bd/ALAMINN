#!/usr/bin/env node
/**
 * Live end-to-end test suite for the ALO Education / ALAMINN platform.
 * Tests run against REAL services: Next.js production server on :3000 and the
 * Universal Messaging Channel service on :3010. Every assertion is a real HTTP
 * observation — no mocks, no stubs.
 *
 * Usage: node tests/run_all.mjs
 * Output: tests/results.json + console summary. Exit code 1 on any failure.
 */
import { writeFileSync } from "node:fs";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? "admin@alaminn.info";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? "Alo-Bootstrap-2026!";
const RESULTS = [];
let passed = 0, failed = 0;

function record(name, ok, detail, extra = {}) {
  RESULTS.push({ name, ok, detail, ...extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passed++; else failed++;
}

function jar() {
  const cookies = new Map();
  return {
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    absorb(res) {
      const raw = res.headers.getSetCookie?.() ?? [];
      for (const line of raw) {
        const [pair] = line.split(";");
        const idx = pair.indexOf("=");
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (value === "") cookies.delete(name); else cookies.set(name, value);
      }
      return raw;
    },
  };
}

async function req(path, { method = "GET", body, cookies: jarRef, headers = {}, form } = {}) {
  const h = { ...headers };
  if (jarRef?.header()) h.cookie = jarRef.header();
  if (body !== undefined) h["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let data = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("json")) data = await res.json().catch(() => null);
  else { const t = await res.text().catch(() => ""); data = ct.includes("csv") ? t.slice(0, 200) : t.slice(0, 4000); }
  return { res, data };
}

// ─────────────────────────── A. PUBLIC ROUTES ───────────────────────────
async function testPublicRoutes() {
  console.log("\n── A. Public routes ──");
  const home = await req("/");
  record("A1 GET / homepage", home.res.status === 200 && String(home.data).includes("ALO Education"), `status=${home.res.status}`);

  const stats = await req("/api/uci/stats");
  const s = stats.data ?? {};
  record("A2 GET /api/uci/stats", stats.res.status === 200 && s.institutions > 0 && typeof s.conflictCount === "number",
    `institutions=${s.institutions} programmes=${s.programmes} records=${s.requirementRecords} conflicts=${s.conflictCount}`);

  const inst = await req("/api/uci/institutions?q=university&pageSize=6");
  record("A3 GET /api/uci/institutions search", inst.res.status === 200 && (inst.data?.items?.length ?? 0) > 0, `total=${inst.data?.total}`);

  const prog = await req("/api/uci/programmes?pageSize=10");
  record("A4 GET /api/uci/programmes", prog.res.status === 200 && (prog.data?.items?.length ?? 0) > 0, `total=${prog.data?.total}`);

  const sources = await req("/api/uci/sources");
  record("A5 GET /api/uci/sources", sources.res.status === 200 && (sources.data?.sources?.length ?? 0) > 0, `count=${sources.data?.sources?.length}`);

  const jobs = await req("/api/uci/jobs");
  record("A6 GET /api/uci/jobs (public read)", jobs.res.status === 200, `count=${jobs.data?.jobs?.length}`);
}

// ─────────────────────────── B. AUTH FLOWS ───────────────────────────
async function testAuth() {
  console.log("\n── B. Authentication flows ──");
  const anon = jar();

  const me0 = await req("/api/auth/me", { cookies: anon });
  record("B1 GET /api/auth/me unauthenticated → 401", me0.res.status === 401, `status=${me0.res.status}`);

  const reg = await req("/api/auth/register", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: "ALO Admin" },
  });
  record("B2 POST /api/auth/register bootstrap first ADMIN → 201", reg.res.status === 201 && reg.data?.account?.role === "ADMIN", `role=${reg.data?.account?.role}`);

  const reg2 = await req("/api/auth/register", {
    method: "POST",
    body: { email: "attacker@alaminn.info", password: "whatever-12345", name: "Attacker" },
  });
  record("B3 POST /api/auth/register after bootstrap without session → 401", reg2.res.status === 401, `status=${reg2.res.status}`);

  const bad = await req("/api/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: "wrong-password-1" } });
  record("B4 POST /api/auth/login wrong password → 401", bad.res.status === 401, `status=${bad.res.status}`);

  const admin = jar();
  const login = await req("/api/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  admin.absorb(login.res);
  const cookieOk = login.res.headers.getSetCookie().some((c) => c.startsWith("alo_session=") && /httponly/i.test(c) && /samesite=lax/i.test(c));
  record("B5 POST /api/auth/login correct → 200 + HttpOnly SameSite cookie", login.res.status === 200 && cookieOk, `status=${login.res.status}`);

  const me = await req("/api/auth/me", { cookies: admin });
  record("B6 GET /api/auth/me with session → role ADMIN", me.res.status === 200 && me.data?.account?.role === "ADMIN", `role=${me.data?.account?.role}`);

  const out = await req("/api/auth/logout", { method: "POST", cookies: admin });
  admin.absorb(out.res);
  const meAfter = await req("/api/auth/me", { cookies: admin });
  record("B7 POST /api/auth/logout revokes session → me 401", out.res.status === 200 && meAfter.res.status === 401, `logout=${out.res.status} me=${meAfter.res.status}`);

  // password reset (single-use OTP, exposed because no mail transport)
  const editor = jar();
  await adminLogin(admin);
  const mk = await req("/api/staff", {
    method: "POST",
    body: { email: "editor@alaminn.info", name: "Data Editor", password: "Editor-2026-Pass!", role: "EDITOR" },
    cookies: admin,
  });
  record("B8 ADMIN creates EDITOR account via /api/staff", mk.res.status === 201 && mk.data?.account?.role === "EDITOR", `status=${mk.res.status}`);

  const mkAgent = await req("/api/staff", {
    method: "POST",
    body: { email: "agent@alaminn.info", name: "Support Agent", password: "Agent-2026-Pass!", role: "AGENT" },
    cookies: admin,
  });
  record("B9 ADMIN creates AGENT account", mkAgent.res.status === 201, `status=${mkAgent.res.status}`);

  const mkViewer = await req("/api/staff", {
    method: "POST",
    body: { email: "viewer@alaminn.info", name: "Read Only", password: "Viewer-2026-Pass!", role: "VIEWER" },
    cookies: admin,
  });
  record("B10 ADMIN creates VIEWER account", mkViewer.res.status === 201, `status=${mkViewer.res.status}`);

  const rst = await req("/api/auth/password-reset", { method: "POST", body: { action: "request", email: "editor@alaminn.info" } });
  const code = rst.data?.code;
  record("B11 POST /api/auth/password-reset request → single-use code issued", rst.res.status === 200 && /^\d{6}$/.test(code ?? ""), `code=${code ?? "none"}`);

  const confirm = await req("/api/auth/password-reset", {
    method: "POST",
    body: { action: "confirm", email: "editor@alaminn.info", code, newPassword: "Editor-Reset-2026!" },
  });
  record("B12 POST /api/auth/password-reset confirm → password changed", confirm.res.status === 200, `status=${confirm.res.status}`);

  const relogin = await req("/api/auth/login", { method: "POST", body: { email: "editor@alaminn.info", password: "Editor-Reset-2026!" } });
  editor.absorb(relogin.res);
  record("B13 Login with reset password works", relogin.res.status === 200, `status=${relogin.res.status}`);

  const oldPw = await req("/api/auth/login", { method: "POST", body: { email: "editor@alaminn.info", password: "Editor-2026-Pass!" } });
  record("B14 Old password rejected after reset", oldPw.res.status === 401, `status=${oldPw.res.status}`);

  return { admin, editor };
}

async function adminLogin(admin) {
  const r = await req("/api/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  admin.absorb(r.res);
  if (r.res.status !== 200) throw new Error("admin login failed: " + JSON.stringify(r.data));
}

// ─────────────────────────── C. RBAC ───────────────────────────
async function testRbac({ admin, editor }) {
  console.log("\n── C. RBAC enforcement ──");
  const anon = jar();
  const viewer = jar();
  await req("/api/auth/login", { method: "POST", body: { email: "viewer@alaminn.info", password: "Viewer-2026-Pass!" } }).then((r) => viewer.absorb(r.res));
  const agent = jar();
  await req("/api/auth/login", { method: "POST", body: { email: "agent@alaminn.info", password: "Agent-2026-Pass!" } }).then((r) => agent.absorb(r.res));

  const q1 = await req("/api/uci/admin/queue", { cookies: anon });
  record("C1 Verification queue unauthenticated → 401", q1.res.status === 401, `status=${q1.res.status}`);

  const q2 = await req("/api/uci/admin/queue", { cookies: viewer });
  record("C2 Verification queue as VIEWER → 403", q2.res.status === 403, `status=${q2.res.status}`);

  const q3 = await req("/api/uci/admin/queue", { cookies: editor });
  record("C3 Verification queue as EDITOR → 200", q3.res.status === 200 && typeof q3.data?.total === "number", `total=${q3.data?.total}`);

  const quality = await req("/api/uci/admin/quality", { cookies: editor });
  record("C4 Quality report as EDITOR → 200 with live counts", quality.res.status === 200 && typeof quality.data?.summary?.conflictCount === "number",
    `conflicts=${quality.data?.summary?.conflictCount} dups=${quality.data?.summary?.duplicateCount}`);

  const staff1 = await req("/api/staff", { cookies: editor });
  record("C5 GET /api/staff as EDITOR → 403", staff1.res.status === 403, `status=${staff1.res.status}`);

  const staff2 = await req("/api/staff", { cookies: admin });
  record("C6 GET /api/staff as ADMIN → 200", staff2.res.status === 200 && (staff2.data?.accounts?.length ?? 0) >= 4, `accounts=${staff2.data?.accounts?.length}`);

  const set1 = await req("/api/settings", { cookies: viewer });
  record("C7 GET /api/settings as VIEWER → 200 (read)", set1.res.status === 200 && set1.data?.tenant?.id, `status=${set1.res.status}`);

  const set2 = await req("/api/settings", { method: "PATCH", body: { messagingStart: 9 }, cookies: viewer });
  record("C8 PATCH /api/settings as VIEWER → 403", set2.res.status === 403, `status=${set2.res.status}`);

  const set3 = await req("/api/settings", { method: "PATCH", body: { messagingStart: 9, messagingEnd: 21, name: "ALO Education" }, cookies: admin });
  record("C9 PATCH /api/settings as ADMIN → 200 (save flow)", set3.res.status === 200 && set3.data?.tenant?.messagingStart === 9, `status=${set3.res.status}`);

  const setBad = await req("/api/settings", { method: "PATCH", body: { messagingStart: 25 }, cookies: admin });
  record("C10 PATCH /api/settings invalid hour → 400", setBad.res.status === 400, `status=${setBad.res.status}`);

  // UMC proxy access
  const umc1 = await req("/api/umc/health", { cookies: agent });
  record("C11 UMC proxy /health as AGENT → 200 (real service)", umc1.res.status === 200 && umc1.data?.ok === true, `status=${umc1.res.status}`);

  const umc2 = await req("/api/umc/health", { cookies: editor });
  record("C12 UMC proxy as EDITOR → 403 (no umc.use)", umc2.res.status === 403, `status=${umc2.res.status}`);

  const umc3 = await req("/api/umc/health");
  record("C13 UMC proxy anonymous → 401", umc3.res.status === 401, `status=${umc3.res.status}`);

  const tenants = await req("/api/umc/tenants", { cookies: agent });
  const tenantId = tenants.data?.tenants?.[0]?.id;
  record("C14 UMC proxy tenant list as AGENT → 200", tenants.res.status === 200 && tenantId, `tenants=${tenants.data?.tenants?.length}`);

  const tenantPatch = await req(`/api/umc/tenants/${tenantId}`, { method: "PATCH", body: { messagingStart: 8, messagingEnd: 22 }, cookies: agent });
  record("C15 UMC proxy tenant PATCH as AGENT → 403 (umc.admin gate)", tenantPatch.res.status === 403, `status=${tenantPatch.res.status}`);

  const tenantPatchAdmin = await req(`/api/umc/tenants/${tenantId}`, { method: "PATCH", body: { messagingStart: 8, messagingEnd: 22 }, cookies: admin });
  record("C16 UMC proxy tenant PATCH as ADMIN → 200 (real save)", tenantPatchAdmin.res.status === 200, `status=${tenantPatchAdmin.res.status}`);

  // jobs: role gate + real fetch through robots gate
  const job1 = await req("/api/uci/jobs", { method: "POST", body: { sourceKey: "official_university_pages", targetUrl: "http://127.0.0.1:3010/api/umc/health" }, cookies: viewer });
  record("C17 POST /api/uci/jobs as VIEWER → 403", job1.res.status === 403, `status=${job1.res.status}`);

  const job2 = await req("/api/uci/jobs", { method: "POST", body: { sourceKey: "official_discovered_1", targetUrl: "http://127.0.0.1:3010/api/umc/health" }, cookies: editor });
  record("C18 POST /api/uci/jobs as EDITOR → real check executes", job2.res.status === 200 && ["SUCCESS", "FAILED", "ROBOTS_BLOCKED"].includes(job2.data?.job?.status),
    `status=${job2.data?.job?.status} http=${job2.data?.job?.httpStatus} findings=${(job2.data?.job?.findings ?? "").slice(0, 40)}`);

  const marge = await req("/api/uci/jobs", { method: "POST", body: { sourceKey: "platform_marge", targetUrl: "https://example.com" }, cookies: editor });
  record("C19 MARGE job refused while identity PENDING → 422", marge.res.status === 422, `status=${marge.res.status}`);

  // actor integrity: verification action records the SESSION identity
  const queue = await req("/api/uci/admin/queue?pageSize=1", { cookies: admin });
  const recId = queue.data?.items?.[0]?.id;
  const action = await req("/api/uci/admin/action", {
    method: "POST",
    body: { recordId: recId, action: "NOTE", note: "RBAC actor-integrity test" },
    cookies: editor,
  });
  record("C20 POST /api/uci/admin/action as EDITOR → 200", action.res.status === 200, `status=${action.res.status}`);

  const audit = await req("/api/uci/audit", { cookies: admin });
  const lastLog = audit.data?.logs?.[0];
  const actorOk = audit.res.status === 200 && (lastLog?.actor === "editor@alaminn.info");
  record("C21 Audit log records session identity (editor@…), not client-supplied actor", actorOk, `actor=${lastLog?.actor}`);

  // last-admin + self protection
  const adminId = staff2.data.accounts.find((a) => a.role === "ADMIN" && a.email === ADMIN_EMAIL)?.id;
  const selfDemote = await req(`/api/staff/${adminId}`, { method: "PATCH", body: { role: "VIEWER" }, cookies: admin });
  record("C22 ADMIN cannot demote own account → 422", selfDemote.res.status === 422, `status=${selfDemote.res.status}`);

  // role change revokes sessions: the API gate must deny access afterwards
  // (401 from DB-side revocation via /api/auth/me; middleware may answer 403)
  const demote = await req(`/api/staff/${staff2.data.accounts.find((a) => a.email === "viewer@alaminn.info")?.id}`, {
    method: "PATCH", body: { role: "AGENT" }, cookies: admin,
  });
  const viewerAfter = await req("/api/uci/admin/queue", { cookies: viewer });
  const meAfter2 = await req("/api/auth/me", { cookies: viewer });
  record("C23 Role change revokes existing sessions", demote.res.status === 200 && [401, 403].includes(viewerAfter.res.status) && meAfter2.res.status === 401,
    `patch=${demote.res.status} queue-after=${viewerAfter.res.status} me-after=${meAfter2.res.status}`);
}

// ─────────────────────────── D. DASHBOARDS ───────────────────────────
async function testDashboards({ admin, editor }) {
  console.log("\n── D. Dashboards & route protection ──");
  const agent = jar();
  await req("/api/auth/login", { method: "POST", body: { email: "agent@alaminn.info", password: "Agent-2026-Pass!" } }).then((r) => agent.absorb(r.res));
  const viewer = jar();
  await req("/api/auth/login", { method: "POST", body: { email: "viewer@alaminn.info", password: "Viewer-2026-Pass!" } }).then((r) => viewer.absorb(r.res));

  const login = await req("/login");
  record("D1 GET /login → 200", login.res.status === 200 && String(login.data).includes("Staff Sign In"), `status=${login.res.status}`);

  const adminAnon = await fetch(`${BASE}/admin`, { redirect: "manual" });
  record("D2 GET /admin anonymous → redirect to /login", adminAnon.status === 307 && adminAnon.headers.get("location")?.includes("/login"),
    `status=${adminAnon.status}`);

  const adminAuthed = await req("/admin", { cookies: admin });
  record("D3 GET /admin as ADMIN → 200", adminAuthed.res.status === 200, `status=${adminAuthed.res.status}`);

  const editorAdmin = await req("/admin", { cookies: editor });
  record("D4 GET /admin as EDITOR → 200 (uci.verify role)", editorAdmin.res.status === 200, `status=${editorAdmin.res.status}`);

  const consoleAgent = await req("/console", { cookies: agent });
  record("D5 GET /console as AGENT → 200", consoleAgent.res.status === 200, `status=${consoleAgent.res.status}`);

  const consoleEditor = await fetch(`${BASE}/console`, { redirect: "manual", headers: { cookie: editor.header() } });
  record("D6 GET /console as EDITOR → redirect (role gate)", consoleEditor.status === 307, `status=${consoleEditor.status}`);

  const dash = await req("/dashboard", { cookies: viewer });
  record("D7 GET /dashboard as VIEWER → 200", dash.res.status === 200, `status=${dash.res.status}`);

  const reports = await req("/reports", { cookies: viewer });
  record("D8 GET /reports as VIEWER → 200", reports.res.status === 200, `status=${reports.res.status}`);

  const settings = await req("/settings", { cookies: admin });
  record("D9 GET /settings as ADMIN → 200", settings.res.status === 200, `status=${settings.res.status}`);
}

// ─────────────────────────── E. IMPORT / EXPORT / FILES ───────────────────────────
async function testDataFlows({ editor, admin }) {
  console.log("\n── E. Import / export / file upload ──");
  const viewer = jar();
  await req("/api/auth/login", { method: "POST", body: { email: "viewer@alaminn.info", password: "Viewer-2026-Pass!" } }).then((r) => viewer.absorb(r.res));

  const stampId = Date.now();
  const csv = `canonical_name,country,institution_type,official_website\nTest University of Sylhet ${stampId},Bangladesh,UNIVERSITY,https://example.edu.bd\n`;
  const mkForm = () =>
    "--XALOTEST\r\nContent-Disposition: form-data; name=\"entity\"\r\n\r\ninstitutions\r\n--XALOTEST\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.csv\"\r\nContent-Type: text/csv\r\n\r\n" + csv + "\r\n--XALOTEST--\r\n";
  const imp1 = await req("/api/uci/import", {
    method: "POST", cookies: editor,
    headers: { "content-type": "multipart/form-data; boundary=XALOTEST" },
    form: mkForm(),
  });
  record("E1 Multipart CSV upload import as EDITOR → 200", imp1.res.status === 200 && imp1.data?.report?.imported === 1, `report=${JSON.stringify(imp1.data?.report ?? {})}`);

  const imp2 = await req("/api/uci/import", {
    method: "POST", cookies: editor,
    headers: { "content-type": "multipart/form-data; boundary=XALOTEST" },
    form: mkForm(),
  });
  record("E2 Duplicate protection on re-import (skipped_duplicates=1)", imp2.res.status === 200 && imp2.data?.report?.skipped_duplicates === 1, `skipped=${imp2.data?.report?.skipped_duplicates}`);

  const imp3 = await req("/api/uci/import", {
    method: "POST", cookies: viewer,
    headers: { "content-type": "multipart/form-data; boundary=XALOTEST" },
    form: "--XALOTEST\r\nContent-Disposition: form-data; name=\"entity\"\r\n\r\ninstitutions\r\n--XALOTEST\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.csv\"\r\nContent-Type: text/csv\r\n\r\n" + csv + "\r\n--XALOTEST--\r\n",
  });
  record("E3 File upload import as VIEWER → 403", imp3.res.status === 403, `status=${imp3.res.status}`);

  const exp = await fetch(`${BASE}/api/uci/export?entity=programmes`, { headers: { cookie: editor.header() } });
  const expText = await exp.text();
  record("E4 CSV export as EDITOR → attachment with provenance headers",
    exp.status === 200 && (exp.headers.get("content-disposition") ?? "").includes("attachment") && expText.split("\n").length > 500,
    `status=${exp.status} disposition=${exp.headers.get("content-disposition")}`);

  const expAnon = await fetch(`${BASE}/api/uci/export?entity=programmes`, { redirect: "manual" });
  record("E5 CSV export anonymous → 401", expAnon.status === 401, `status=${expAnon.status}`);
}

// ─────────────────────────── F. UMC REAL MESSAGE FLOW ───────────────────────────
async function testUmcFlow({ admin }) {
  console.log("\n── F. Universal Messaging Channel (real flow via proxy) ──");
  const agent = jar();
  await req("/api/auth/login", { method: "POST", body: { email: "agent@alaminn.info", password: "Agent-2026-Pass!" } }).then((r) => agent.absorb(r.res));

  const tenants = await req("/api/umc/tenants", { cookies: agent });
  const tenantId = tenants.data?.tenants?.[0]?.id;
  const users = await req(`/api/umc/tenants/${tenantId}/users`, { cookies: agent });
  const agentUser = users.data?.users?.find((u) => u.role === "agent" || u.role === "admin");
  const convs = await req(`/api/umc/tenants/${tenantId}/conversations?userId=${agentUser?.id}`, { cookies: agent });
  const conv = convs.data?.conversations?.[0];

  record("F1 Tenant + agent + conversation available", Boolean(tenantId && agentUser?.id && conv?.id), `tenant=${tenantId?.slice(0, 8)} conv=${conv?.id?.slice(0, 8)}`);

  if (conv?.id) {
    const stamp = new Date().toISOString();
    const send = await req(`/api/umc/conversations/${conv.id}/messages`, {
      method: "POST", cookies: agent,
      body: { tenantId, senderId: agentUser.id, body: `Live RBAC-proxy test message ${stamp}` },
    });
    const msgOk = send.res.status === 200 && send.data?.messageId;
    record("F2 Real agent message send via authenticated proxy", send.res.status === 200 && Boolean(msgOk), `messageId=${send.data?.messageId ?? "none"}`);

    const thread = await req(`/api/umc/conversations/${conv.id}/messages?limit=5`, { cookies: agent });
    const found = thread.data?.messages?.some((m) => m.body?.includes(stamp));
    record("F3 Sent message readable in thread (persisted)", thread.res.status === 200 && found === true, `found=${found}`);
  }
}

// ─────────────────────────── G. SECURITY HARDENING ───────────────────────────
async function testSecurity() {
  console.log("\n── G. Security hardening ──");
  const home = await fetch(`${BASE}/`);
  const h = home.headers;
  const secOk = h.get("x-content-type-options") === "nosniff"
    && h.get("x-frame-options") === "SAMEORIGIN"
    && h.get("referrer-policy") === "strict-origin-when-cross-origin"
    && (h.get("permissions-policy") ?? "").includes("microphone=()");
  record("G1 Security headers on every response", secOk,
    `nosniff=${h.get("x-content-type-options")} frame=${h.get("x-frame-options")}`);

  const lp = await req("/api/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: "totally-wrong-99" } });
  record("G2 Uniform invalid-credentials response (no enumeration)", lp.res.status === 401 && lp.data?.error === "Invalid email or password", `status=${lp.res.status}`);

  let got429 = false;
  for (let i = 0; i < 12; i++) {
    const r = await req("/api/auth/login", { method: "POST", body: { email: "ratelimit@alaminn.info", password: "nope-nope-nope" } });
    if (r.res.status === 429) { got429 = true; break; }
  }
  record("G3 Login rate limiting engages (429 after repeated failures)", got429, "");

  const bigBody = await req("/api/auth/login", { method: "POST", body: { email: "x@y.z", password: "a".repeat(300) } });
  record("G4 Oversized credential payload rejected → 400", bigBody.res.status === 400, `status=${bigBody.res.status}`);
}

// ─────────────────────────── RUN ───────────────────────────
(async () => {
  const started = Date.now();
  try {
    await testPublicRoutes();
    const ctx = await testAuth();
    await testRbac(ctx);
    await testDashboards(ctx);
    await testDataFlows(ctx);
    await testUmcFlow(ctx);
    await testSecurity();
  } catch (e) {
    record("SUITE", false, `unexpected: ${e.stack?.slice(0, 300)}`);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify({
    base: BASE, passed, failed, seconds, results: RESULTS, generatedAt: new Date().toISOString(),
  }, null, 2));
  console.log(`\n══════════════════════════════════════\n  ${passed} passed, ${failed} failed  (${seconds}s)\n══════════════════════════════════════`);
  process.exit(failed > 0 ? 1 : 0);
})();

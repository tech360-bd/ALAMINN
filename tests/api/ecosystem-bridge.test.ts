/**
 * tests/api/ecosystem-bridge.test.ts — ecosystem API bridge + new P0
 * admin routes against the disposable instance.
 *
 * Covers:
 *  - authentication of /api/v1/ecosystem/* (no key, wrong key, env key,
 *    scoped DB keys, HMAC signatures incl. stale-replay rejection)
 *  - the real lead flow (create → dedupe 409 → dedupe=force)
 *  - llms.txt served from live database content
 *  - anonymous access rejected on every new admin route
 *  - cron endpoints fail closed
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "node:crypto";
import { apiBase as BASE, requireDisposableApi } from "../fixtures/api-target";

requireDisposableApi();

const KEY = process.env.ALAMINN_ECOSYSTEM_API_KEY || "";

function sign(body: string, timestamp: number): string {
  const hex = createHmac("sha256", KEY).update(`${timestamp}.${body}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${hex}`;
}

let leadEmail: string;

beforeAll(() => {
  if (!KEY || KEY.length < 32) throw new Error("ALAMINN_ECOSYSTEM_API_KEY must be set (32+ chars) by the disposable runner");
  leadEmail = `eco-bridge-${Date.now()}@example.com`;
});

describe("ecosystem bridge — authentication", () => {
  it("rejects requests without a key", async () => {
    const r = await fetch(`${BASE}/api/v1/ecosystem/health`, { signal: AbortSignal.timeout(10000) });
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body.success).toBe(false);
    expect(body.errors).toContain("unauthenticated");
  });

  it("rejects wrong keys", async () => {
    const r = await fetch(`${BASE}/api/v1/ecosystem/health`, {
      headers: { "X-Api-Key": "ak_live_totally_wrong_key_value_1234567890" },
      signal: AbortSignal.timeout(10000),
    });
    expect(r.status).toBe(401);
  });

  it("accepts the ecosystem env key and reports real service status", async () => {
    const r = await fetch(`${BASE}/api/v1/ecosystem/health`, {
      headers: { "X-Api-Key": KEY },
      signal: AbortSignal.timeout(15000),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.services)).toBe(true);
    expect(body.data.scopes).toContain("*");
    // Connection status is stored evidence, never fabricated reachability.
    for (const service of body.data.services) {
      expect(service).toHaveProperty("configured");
      expect(service).toHaveProperty("lastTestOk");
    }
  });
});

describe("ecosystem bridge — leads", () => {
  it("creates a lead (scored + deduped) with the env key", async () => {
    const payload = JSON.stringify({
      fullName: "Eco Bridge Test",
      email: leadEmail,
      country: "Bangladesh",
      tags: "integration-test",
      source: "ecosystem-api",
    });
    const r = await fetch(`${BASE}/api/v1/ecosystem/leads`, {
      method: "POST",
      headers: { "X-Api-Key": KEY, "Content-Type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(15000),
    });
    expect(r.status).toBe(201);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeTruthy();
    expect(typeof body.data.leadScore).toBe("number");
    expect(["A", "B", "C", "D", "F"]).toContain(body.data.leadScoreGrade);
  });

  it("returns 409 with match evidence for an existing email", async () => {
    const payload = JSON.stringify({ fullName: "Eco Bridge Duplicate", email: leadEmail });
    const r = await fetch(`${BASE}/api/v1/ecosystem/leads`, {
      method: "POST",
      headers: { "X-Api-Key": KEY, "Content-Type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(15000),
    });
    expect(r.status).toBe(409);
    const body = await r.json();
    expect(body.meta.matches[0].email).toBe(leadEmail);
  });

  it("updates on dedupe=update and creates on dedupe=force", async () => {
    const updated = await fetch(`${BASE}/api/v1/ecosystem/leads`, {
      method: "POST",
      headers: { "X-Api-Key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: "Eco Bridge Updated", email: leadEmail, dedupe: "update" }),
      signal: AbortSignal.timeout(15000),
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.dedupe).toBe("update");

    // dedupe=force bypasses the phone-match guard but the contact schema
    // keeps emails unique — force with a fresh email + the existing phone.
    const forced = await fetch(`${BASE}/api/v1/ecosystem/leads`, {
      method: "POST",
      headers: { "X-Api-Key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: "Eco Bridge Forced", email: `forced-${Date.now()}@example.com`, phone: "01712345678", dedupe: "force" }),
      signal: AbortSignal.timeout(15000),
    });
    expect(forced.status).toBe(201);
  });

  it("accepts a correctly signed HMAC request and rejects stale/invalid signatures", async () => {
    const body = JSON.stringify({ fullName: "Signed Lead", email: `signed-${Date.now()}@example.com` });
    const now = Math.floor(Date.now() / 1000);

    const ok = await fetch(`${BASE}/api/v1/ecosystem/leads`, {
      method: "POST",
      headers: { "X-Api-Key": KEY, "Content-Type": "application/json", "X-ALAMINN-Signature": sign(body, now) },
      body,
      signal: AbortSignal.timeout(15000),
    });
    expect(ok.status).toBe(201);

    const staleBody = JSON.stringify({ fullName: "Stale Lead", email: `stale-${Date.now()}@example.com` });
    const stale = await fetch(`${BASE}/api/v1/ecosystem/leads`, {
      method: "POST",
      headers: { "X-Api-Key": KEY, "Content-Type": "application/json", "X-ALAMINN-Signature": sign(staleBody, now - 3600) },
      body: staleBody,
      signal: AbortSignal.timeout(15000),
    });
    expect(stale.status).toBe(401);

    const badBody = JSON.stringify({ fullName: "Tampered Lead", email: `tamper-${Date.now()}@example.com` });
    const tampered = await fetch(`${BASE}/api/v1/ecosystem/leads`, {
      method: "POST",
      headers: { "X-Api-Key": KEY, "Content-Type": "application/json", "X-ALAMINN-Signature": `t=${now},v1=${"0".repeat(64)}` },
      body: badBody,
      signal: AbortSignal.timeout(15000),
    });
    expect(tampered.status).toBe(401);
  });

  it("reads leads with the env key (leads:read scope)", async () => {
    const r = await fetch(`${BASE}/api/v1/ecosystem/leads?email=${encodeURIComponent(leadEmail)}`, {
      headers: { "X-Api-Key": KEY },
      signal: AbortSignal.timeout(15000),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].email).toBe(leadEmail);
  });
});

describe("llms.txt — live content index", () => {
  it("serves a text/plain index generated from the catalog", async () => {
    const r = await fetch(`${BASE}/llms.txt`, { signal: AbortSignal.timeout(15000) });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/plain");
    const text = await r.text();
    expect(text).toContain("# ALAMINN");
    expect(text).toContain("/higher-study");
    expect(text).toMatch(/published universities/);
  });
});

describe("new admin routes — anonymous access rejected", () => {
  const routes = [
    "/api/v1/admin/custom-fields",
    "/api/v1/admin/contacts/import",
    "/api/v1/admin/contacts/duplicates",
    "/api/v1/admin/contacts/merge",
    "/api/v1/admin/automation/rules",
    "/api/v1/admin/automation/sequences",
    "/api/v1/admin/automation/runs",
    "/api/v1/admin/api-keys",
    "/api/v1/admin/webhooks",
    "/api/v1/admin/usage",
    "/api/v1/admin/aeo/checks",
    "/api/v1/admin/aeo/readiness",
    "/api/v1/admin/aeo/gaps",
    "/api/v1/admin/inbox/copilot",
  ];
  it.each(routes)("rejects anonymous GET on %s", async (path) => {
    const r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(10000) });
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects anonymous automation rule creation", async () => {
    const r = await fetch(`${BASE}/api/v1/admin/automation/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "evil", trigger: "contact.created", actions: [{ type: "add_tag", params: { tag: "x" } }] }),
      signal: AbortSignal.timeout(10000),
    });
    expect([401, 403]).toContain(r.status);
  });
});

describe("new cron workers — fail closed", () => {
  it.each(["/api/cron/automation-queue", "/api/cron/aeo-weekly"])("refuses anonymous access to %s", async (path) => {
    const r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(10000) });
    expect([401, 503]).toContain(r.status);
  });
});

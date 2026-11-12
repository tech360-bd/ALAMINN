import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const routes = ["/api/v1/admin/kits/documents", "/api/v1/admin/crm", "/api/v1/admin/marketing", "/api/v1/admin/seo-dashboard", "/api/v1/admin/analytics-dashboard", "/api/v1/admin/email-builder", "/api/v1/admin/social-scheduler", "/api/v1/admin/live-chat", "/api/v1/admin/integrations"];
describe("feature kit API security", () => {
  it.each(routes)("rejects anonymous access to %s", async path => { const r = await fetch(BASE + path, { signal: AbortSignal.timeout(10000) }); expect(r.status).toBe(401); expect(r.headers.get("cache-control")).toContain("no-store"); });
  it("requires the cron secret for both delivery workers", async () => {
    // Both statuses are fail-closed refusals of anonymous access:
    //  - 401: CRON_SECRET configured, request carried no/wrong secret (CI)
    //  - 503: CRON_SECRET not configured on the server (fail-closed hardening,
    //         see src/lib/cron-auth.ts). Local dev servers without the secret
    //         must also count as "access refused" so the suite is env-independent.
    for (const path of ["/api/cron/email-queue", "/api/cron/social-publish"]) {
      const r = await fetch(BASE + path);
      expect([401, 503]).toContain(r.status);
    }
  });
  it("does not allow visitor conversation access without a token", async () => { const r = await fetch(BASE + "/api/v1/support/test-id"); expect(r.status).toBe(404); expect((await r.json()).data ?? null).toBeNull(); });
  it("rejects cross-origin admin mutations even with a valid body", async () => { const r = await fetch(BASE + "/api/v1/admin/crm", { method: "POST", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: JSON.stringify({ title: "Blocked" }) }); expect([401,403]).toContain(r.status); });
});

/**
 * tests/api/admin-auth.test.ts — admin endpoint authn guards
 *
 * Verifies that admin CRM endpoints reject unauthenticated callers with
 * HTTP 401. If the dev server is not reachable on port 3000, `beforeAll`
 * throws — which fails every test in this file with a clear message,
 * instead of silently skipping (so CI catches a missing dev server).
 */
import { describe, it, expect } from "vitest";
import { apiBase as BASE, requireDisposableApi } from '../fixtures/api-target';

requireDisposableApi();


describe("Admin API — unauthenticated access is rejected", () => {
  it("GET /api/v1/admin/dashboard returns 401 without a session cookie", async () => {
    const res = await fetch(`${BASE}/api/v1/admin/dashboard`, {
      credentials: "omit",
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors).toContain("unauthenticated");
  });

  it("GET /api/v1/admin/contacts returns 401 without a session cookie", async () => {
    const res = await fetch(`${BASE}/api/v1/admin/contacts`, {
      credentials: "omit",
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errors).toContain("unauthenticated");
  });
});

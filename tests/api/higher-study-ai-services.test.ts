/**
 * Integration tests for the new public AI Services API and the
 * authenticated Command Center metrics endpoint. These run against the
 * disposable Next.js app started by `npm run test:disposable`.
 */
import { describe, expect, it } from "vitest";
import { apiBase, requireDisposableApi } from "../fixtures/api-target";

requireDisposableApi();

describe("Higher Study AI Services API", () => {
  it("publishes the 18-service catalogue without authentication", async () => {
    const res = await fetch(`${apiBase}/api/v1/higher-study/ai-services`, {
      credentials: "omit",
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.services).toHaveLength(18);
    expect(body.data.services.some((s: { id: string }) => s.id === "cv-builder")).toBe(true);
  });

  it("rejects invalid generation input before calling any provider", async () => {
    const res = await fetch(`${apiBase}/api/v1/higher-study/ai-services`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({ serviceId: "cv-builder", language: "en", inputs: { unexpected: "x" } }),
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errors).toContain("invalid_inputs");
  });

  it("returns 404 for an unknown service", async () => {
    const res = await fetch(`${apiBase}/api/v1/higher-study/ai-services`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({ serviceId: "not-a-service", language: "en", inputs: {} }),
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(404);
  });

  it("protects private draft history", async () => {
    const res = await fetch(`${apiBase}/api/v1/higher-study/ai-services/documents`, {
      credentials: "omit",
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(401);
  });
});

describe("Command Center metrics API", () => {
  it("rejects anonymous access", async () => {
    const res = await fetch(`${apiBase}/api/v1/admin/command-center`, {
      credentials: "omit",
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(401);
  });
});

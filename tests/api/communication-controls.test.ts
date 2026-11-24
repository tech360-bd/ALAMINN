/** Anonymous guards for the new communication control and provider registry APIs. */
import { describe, expect, it } from "vitest";
import { apiBase, requireDisposableApi } from "../fixtures/api-target";

requireDisposableApi();

describe("Communication controls API", () => {
  it("rejects anonymous reads", async () => {
    const res = await fetch(`${apiBase}/api/v1/admin/communication-controls`, {
      credentials: "omit",
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(401);
  });

  it("rejects anonymous mode changes", async () => {
    const res = await fetch(`${apiBase}/api/v1/admin/communication-controls`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({ mode: "PAUSED" }),
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(401);
  });
});

describe("AI Provider registry API", () => {
  it("rejects anonymous access", async () => {
    const res = await fetch(`${apiBase}/api/v1/admin/ai-agent/providers`, {
      credentials: "omit",
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(401);
  });
});

import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, hasScope, checkKeyRateLimit, resetKeyRateLimits, API_KEY_SCOPES } from "@/lib/api-platform/keys";
import { signWebhookPayload, verifyWebhookSignature, emitWebhookEvent, setWebhookFetchForTests, generateWebhookSecret } from "@/lib/api-platform/webhooks";

describe("API keys", () => {
  it("generates prefixed keys and stores only hashes", () => {
    const { rawKey, prefix, hashedKey } = generateApiKey();
    expect(rawKey).toMatch(/^ak_live_[0-9a-f]{48}$/);
    expect(prefix).toBe(rawKey.slice(0, 10));
    expect(hashedKey).toBe(hashApiKey(rawKey));
    expect(hashedKey).not.toContain(rawKey.slice(8));
    expect(API_KEY_SCOPES.length).toBeGreaterThan(5);
  });

  it("checks scopes without wildcard leakage", () => {
    expect(hasScope({ scopes: ["leads:write"] }, "leads:write")).toBe(true);
    expect(hasScope({ scopes: ["leads:write"] }, "leads:read")).toBe(false);
    expect(hasScope({ scopes: ["*"] }, "copilot:invoke")).toBe(true);
  });

  it("enforces a sliding-window rate limit per key", () => {
    resetKeyRateLimits();
    for (let i = 0; i < 3; i++) {
      expect(checkKeyRateLimit("k", 3).allowed).toBe(true);
    }
    const blocked = checkKeyRateLimit("k", 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(checkKeyRateLimit("other", 3).allowed).toBe(true);
    resetKeyRateLimits();
  });
});

describe("webhooks", () => {
  it("signs payloads HMAC-SHA256 and verifies with constant-time equality", () => {
    const secret = "whsec_test";
    const body = JSON.stringify({ hello: "world" });
    const sig = signWebhookPayload(secret, 1700000000, body);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyWebhookSignature(secret, 1700000000, body, sig)).toBe(true);
    expect(verifyWebhookSignature("whsec_other", 1700000000, body, sig)).toBe(false);
    expect(verifyWebhookSignature(secret, 1700000001, body, sig)).toBe(false);
  });

  it("generates distinct secrets", () => {
    expect(generateWebhookSecret()).not.toBe(generateWebhookSecret());
  });

  it("emits to subscribed endpoints with retries, and records failures", async () => {
    const deliveries: Array<{ endpointId: string; event: string; payload: string; status: string; attempts: number }> = [];
    const rows: Record<string, unknown> = {};
    let calls = 0;
    setWebhookFetchForTests(async () => {
      calls++;
      return { ok: false, status: 500 } as unknown as Response;
    });
    const dbSeam = {
      webhookEndpoint: {
        findMany: async () => [
          { id: "e1", url: "https://example.com/hook", events: JSON.stringify(["contact.created"]), secret: "s1" },
          { id: "e2", url: "https://example.com/other", events: JSON.stringify(["inquiry.created"]), secret: "s2" }, // not subscribed
        ],
      },
      webhookDelivery: {
        create: async ({ data }: { data: { endpointId: string; event: string; payload: string; status: string } }) => {
          deliveries.push({ ...data, attempts: 0 });
          return { id: `d${deliveries.length}` };
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = deliveries[Number(where.id.slice(1)) - 1];
          if (row) Object.assign(row, data);
          return {};
        },
      },
    } as never;
    void rows;


    const result = await emitWebhookEvent("contact.created", { contactId: "c1" }, dbSeam);
    setWebhookFetchForTests(null);
    expect(result.endpoints).toBe(1); // e2 not subscribed
    expect(result.delivered).toBe(0);
    expect(result.failed).toBe(1);
    expect(calls).toBe(3); // 3 attempts
    expect(deliveries[0]).toMatchObject({ status: "failed", attempts: 3, endpointId: "e1" });
  });
});

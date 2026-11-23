import { createHmac } from "node:crypto";
import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isolatedDbPath } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  const file = execFileSync(process.execPath, ["tests/fixtures/init-sqlite.mjs"], {
    encoding: "utf8",
  }).trim();
  process.env.DATABASE_URL = `file:${file}`;
  return { isolatedDbPath: file };
});

import { db } from "@/lib/db";
import {
  GET as whatsappWebhookGet,
  POST as whatsappWebhookPost,
} from "@/app/api/v1/whatsapp/webhook/route";
import { POST as socialWebhookPost } from "@/app/api/v1/social/webhooks/[platform]/route";

const TEST_SECRET = "whatsapp-meta-app-secret-for-integration-test-32b";

function signBody(body: string, secret = TEST_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

describe("Task 02 — WhatsApp & Social Webhook HMAC Signature, Fail-Closed & Replay Protection", () => {
  const origWhatsappSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  const origMetaSecret = process.env.META_APP_SECRET;
  const origVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  afterAll(async () => {
    await db.$disconnect();
    rmSync(dirname(isolatedDbPath), { recursive: true, force: true });
  });

  beforeEach(() => {
    process.env.WHATSAPP_WEBHOOK_SECRET = TEST_SECRET;
    delete process.env.META_APP_SECRET;
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-token-test-123";
  });

  afterEach(() => {
    if (origWhatsappSecret === undefined) delete process.env.WHATSAPP_WEBHOOK_SECRET;
    else process.env.WHATSAPP_WEBHOOK_SECRET = origWhatsappSecret;
    if (origMetaSecret === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = origMetaSecret;
    if (origVerifyToken === undefined) delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    else process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = origVerifyToken;
  });

  it("fails closed with 503 when WHATSAPP_WEBHOOK_SECRET is not configured", async () => {
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
    delete process.env.META_APP_SECRET;

    const payload = JSON.stringify({ entry: [] });
    const req = new NextRequest("http://localhost/api/v1/whatsapp/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signBody(payload),
      },
      body: payload,
    });

    const res = await whatsappWebhookPost(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.errors).toContain("webhook_secret_not_configured");
  });

  it("rejects missing, invalid, and tampered-body signatures with 401", async () => {
    const payload = JSON.stringify({
      from: "+8801711000001",
      text: "Hello",
      messageId: `msg-auth-${Date.now()}`,
      timestamp: Math.floor(Date.now() / 1000),
    });

    // 1. Missing signature
    const missingSigReq = new NextRequest("http://localhost/api/v1/whatsapp/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    expect((await whatsappWebhookPost(missingSigReq)).status).toBe(401);

    // 2. Wrong secret signature
    const wrongSigReq = new NextRequest("http://localhost/api/v1/whatsapp/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signBody(payload, "wrong-secret-key-0000000000000000"),
      },
      body: payload,
    });
    expect((await whatsappWebhookPost(wrongSigReq)).status).toBe(401);

    // 3. Valid signature computed over original body, but body modified in transit
    const validSig = signBody(payload);
    const tamperedBody = payload.replace("Hello", "Tampered");
    const tamperedReq = new NextRequest("http://localhost/api/v1/whatsapp/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": validSig,
      },
      body: tamperedBody,
    });
    expect((await whatsappWebhookPost(tamperedReq)).status).toBe(401);
  });

  it("rejects stale timestamps outside the 15-minute replay window with 409", async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
    const payload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: `msg-stale-${Date.now()}`,
                    from: "8801711000002",
                    timestamp: String(staleTimestamp),
                    type: "text",
                    text: { body: "Stale replay" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const req = new NextRequest("http://localhost/api/v1/whatsapp/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signBody(payload),
      },
      body: payload,
    });

    const res = await whatsappWebhookPost(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.errors).toContain("stale_timestamp");
  });

  it("accepts a valid signed Meta webhook payload and deduplicates replayed messageIds", async () => {
    const uniqueMsgId = `wamid.test.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    const phoneNumberId = `phone-number-test-${Date.now()}`;
    await db.socialAccount.create({ data: { platform: "whatsapp", externalId: phoneNumberId, displayName: "Test WhatsApp", status: "connected", responseMode: "approval", automationEnabled: false } });
    const payload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: phoneNumberId },
                messages: [
                  {
                    id: uniqueMsgId,
                    from: "8801711223344",
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Hi, I want information about UK universities" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const sig = signBody(payload);

    // First delivery -> processed
    const firstReq = new NextRequest("http://localhost/api/v1/whatsapp/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sig,
      },
      body: payload,
    });
    const firstRes = await whatsappWebhookPost(firstReq);
    expect(firstRes.status).toBe(200);
    const firstJson = await firstRes.json();
    expect(firstJson.success).toBe(true);
    expect(firstJson.data.outcomes).toHaveLength(1);
    expect(firstJson.data.outcomes[0]).toMatchObject({ messageId: uniqueMsgId, account: phoneNumberId });
    expect(firstJson.data.outcomes[0].outcome).toBe("held_for_approval");
    const savedMessage = await db.socialMessage.findFirst({ where: { providerMessageId: uniqueMsgId } });
    expect(savedMessage).toMatchObject({ direction: "inbound", body: "Hi, I want information about UK universities" });

    // Second delivery with identical messageId -> deduplicated
    const replayReq = new NextRequest("http://localhost/api/v1/whatsapp/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sig,
      },
      body: payload,
    });
    const replayRes = await whatsappWebhookPost(replayReq);
    expect(replayRes.status).toBe(200);
    const replayJson = await replayRes.json();
    expect(replayJson.success).toBe(true);
    expect(replayJson.data.outcomes).toEqual([{ messageId: uniqueMsgId, account: phoneNumberId, outcome: "duplicate_suppressed" }]);
  });

  it("persists messages from every phone-number account in the unified inbox", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const phoneIds = [`multi-phone-a-${suffix}`, `multi-phone-b-${suffix}`];
    for (const [index, phoneNumberId] of phoneIds.entries()) {
      await db.socialAccount.create({ data: { platform: "whatsapp", externalId: phoneNumberId, displayName: `WhatsApp ${index + 1}`, status: "connected", responseMode: "approval", automationEnabled: false } });
    }
    const payload = JSON.stringify({ entry: [
      { changes: [{ value: { metadata: { phone_number_id: phoneIds[0] }, messages: [
        { id: `wamid.multi.a.${suffix}`, from: "8801711000001", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Account one message" } },
        { id: `wamid.multi.a2.${suffix}`, from: "8801711000002", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Second message on account one" } },
      ] } }] },
      { changes: [{ value: { metadata: { phone_number_id: phoneIds[1] }, messages: [
        { id: `wamid.multi.b.${suffix}`, from: "8801711000003", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Account two message" } },
      ] } }] },
    ] });
    const req = new NextRequest("http://localhost/api/v1/whatsapp/webhook", {
      method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": signBody(payload) }, body: payload,
    });
    const res = await whatsappWebhookPost(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.outcomes).toHaveLength(3);
    const messages = await db.socialMessage.findMany({ where: { providerMessageId: { in: [`wamid.multi.a.${suffix}`, `wamid.multi.a2.${suffix}`, `wamid.multi.b.${suffix}`] } }, include: { conversation: true } });
    expect(messages).toHaveLength(3);
    expect(messages.find((message) => message.providerMessageId === `wamid.multi.a.${suffix}`)?.conversation.accountId).not.toBe(messages.find((message) => message.providerMessageId === `wamid.multi.b.${suffix}`)?.conversation.accountId);
    expect(messages.find((message) => message.providerMessageId === `wamid.multi.a.${suffix}`)?.conversation.accountId).toBe((await db.socialAccount.findUnique({ where: { platform_externalId: { platform: "whatsapp", externalId: phoneIds[0] } } }))?.id);
  });

  it("verifies GET hub.verify_token challenge and rejects mismatched tokens", async () => {
    const okReq = new NextRequest(
      "http://localhost/api/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-token-test-123&hub.challenge=challenge_987",
    );
    const okRes = await whatsappWebhookGet(okReq);
    expect(okRes.status).toBe(200);
    expect(await okRes.text()).toBe("challenge_987");

    const badReq = new NextRequest(
      "http://localhost/api/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge_987",
    );
    const badRes = await whatsappWebhookGet(badReq);
    expect(badRes.status).toBe(403);
  });

  it("enforces fail-closed 503 and HMAC verification on /api/v1/social/webhooks/[platform]", async () => {
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
    delete process.env.META_APP_SECRET;

    const body = JSON.stringify({ entry: [] });
    const noSecretReq = new NextRequest(
      "http://localhost/api/v1/social/webhooks/facebook",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      },
    );
    const noSecretRes = await socialWebhookPost(noSecretReq, {
      params: Promise.resolve({ platform: "facebook" }),
    });
    expect(noSecretRes.status).toBe(503);

    process.env.META_APP_SECRET = TEST_SECRET;
    const badSigReq = new NextRequest(
      "http://localhost/api/v1/social/webhooks/facebook",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": "sha256=deadbeef",
        },
        body,
      },
    );
    const badSigRes = await socialWebhookPost(badSigReq, {
      params: Promise.resolve({ platform: "facebook" }),
    });
    expect(badSigRes.status).toBe(401);
  });
});

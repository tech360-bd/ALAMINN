import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isolatedDbPath } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  const file = execFileSync(process.execPath, ["tests/fixtures/init-sqlite.mjs"], { encoding: "utf8" }).trim();
  process.env.DATABASE_URL = `file:${file}`;
  return { isolatedDbPath: file };
});

vi.mock("@/lib/auth", () => ({ requirePermission: vi.fn(async () => ({ denied: false, session: { userId: "test-owner" } })) }));
vi.mock("@/lib/admin-api-server", () => ({
  readJson: vi.fn(async (request: Request) => request.json()),
  writeAudit: vi.fn(async () => undefined),
  ok: (data: unknown, message: string, meta: unknown, status = 200) => NextResponse.json({ success: true, data, message, meta }, { status }),
  fail: (message: string, errors: string[], status = 400, data: unknown = null) => NextResponse.json({ success: false, message, errors, data }, { status }),
}));

import { db } from "@/lib/db";
import { encryptToken } from "@/lib/social/crypto";
import { POST } from "@/app/api/v1/whatsapp/send/route";

const originalAuthSecret = process.env.AUTH_SECRET;

afterAll(async () => {
  if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalAuthSecret;
  await db.$disconnect();
  rmSync(dirname(isolatedDbPath), { recursive: true, force: true });
});
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => { process.env.AUTH_SECRET = "whatsapp-send-integration-secret-32-bytes"; });

async function createAccount(externalId: string) {
  return db.socialAccount.create({
    data: {
      platform: "whatsapp", externalId, displayName: `Business ${externalId}`,
      status: "connected", responseMode: "manual", tokenEncrypted: encryptToken(`secret-${externalId}`),
    },
  });
}

function request(body: unknown) {
  return new NextRequest("http://localhost/api/v1/whatsapp/send", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("WhatsApp account-scoped manual sending", () => {
  it("uses only the selected account and persists accepted outbound messages in the inbox", async () => {
    const account = await createAccount(`phone-selected-${Date.now()}`);
    const participantId = "8801711000001";
    const conversation = await db.socialConversation.create({
      data: { accountId: account.id, platform: "whatsapp", externalThreadId: participantId, participantId },
    });
    await db.socialMessage.create({
      data: { conversationId: conversation.id, direction: "inbound", body: "Please contact me", senderId: participantId, createdAt: new Date() },
    });
    const providerSend = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.manual.selected" }] }), { status: 200 }));
    vi.stubGlobal("fetch", providerSend);

    const response = await POST(request({ accountId: account.id, to: participantId, text: "Following up" }));
    expect(response.status).toBe(200);
    expect(providerSend).toHaveBeenCalledOnce();
    const [url, init] = providerSend.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe(`https://graph.facebook.com/v18.0/${account.externalId}/messages`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer secret-${account.externalId}`);

    const saved = await db.socialMessage.findUnique({ where: { providerMessageId: "wamid.manual.selected" } });
    expect(saved).toMatchObject({ conversationId: conversation.id, direction: "outbound", body: "Following up", isOwn: true, deliveryStatus: "sent" });
  });

  it("fails closed outside the customer-service window and does not call Meta", async () => {
    const account = await createAccount(`phone-expired-${Date.now()}`);
    const participantId = "8801711000002";
    const conversation = await db.socialConversation.create({
      data: { accountId: account.id, platform: "whatsapp", externalThreadId: participantId, participantId },
    });
    await db.socialMessage.create({
      data: { conversationId: conversation.id, direction: "inbound", body: "Yesterday", senderId: participantId, createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    const providerSend = vi.fn();
    vi.stubGlobal("fetch", providerSend);

    const response = await POST(request({ accountId: account.id, to: participantId, text: "Out of window" }));
    expect(response.status).toBe(409);
    expect((await response.json()).errors).toContain("customer_service_window_closed");
    expect(providerSend).not.toHaveBeenCalled();
  });

  it("requires an explicit account ID", async () => {
    const response = await POST(request({ to: "8801711000003", text: "No account selected" }));
    expect(response.status).toBe(400);
    expect((await response.json()).errors).toContain("account_required");
  });
});

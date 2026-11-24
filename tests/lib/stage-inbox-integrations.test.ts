import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const store = {
  conversations: [{ id: "conv1", channel: "whatsapp", accountId: "acc1", externalThreadId: "8801711660955", status: "open" }],
  messages: [] as { id: string; conversationId: string; idempotencyKey: string | null }[],
  ingestAudit: [] as unknown[],
};

vi.mock("@/lib/auth", () => ({
  requirePermission: vi.fn(async () => ({ denied: false, session: { userId: "u1" } })),
  requireAuth: vi.fn(async () => ({ user: { userId: "u1" } })),
}));
vi.mock("@/lib/admin-api-server", () => ({ writeAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/social/crypto", () => ({ decryptToken: vi.fn(() => "test-token") }));
vi.mock("@/lib/db", () => ({
  db: {
    socialAccount: {
      findFirst: async ({ where }: { where: { platform: string; externalId?: string; id?: string } }) =>
        where.externalId === "PAGE-1" || where.id === "acc1" || where.id === "google-account"
          ? { id: "acc1", externalId: where.platform === "google" ? "primary" : "PAGE-1", tokenEncrypted: "enc" }
          : null,
    },
    inboxConversation: {
      findUnique: async ({ where }: { where: { id: string } }) => store.conversations.find((c) => c.id === where.id) ?? null,
      upsert: async () => store.conversations[0],
      update: async ({ data }: { data: Record<string, unknown> }) => ({ ...store.conversations[0], ...data }),
    },
    inboxContact: {
      findMany: async () => [],
      create: async () => ({ id: "contact1" }),
    },
    inboxMessage: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) => store.messages.find((m) => m.idempotencyKey === where.idempotencyKey) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const message = { id: `m${store.messages.length + 1}`, conversationId: String(data.conversationId), idempotencyKey: (data.idempotencyKey as string | null) ?? null };
        store.messages.push(message);
        return message;
      },
    },
    inboxAudit: { create: async ({ data }: { data: unknown }) => { store.ingestAudit.push(data); return {}; } },
    inboxAttachment: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "att1", ...data }),
      findUnique: async () => null,
    },
    cmsEntry: { findUnique: async () => ({ id: "e1", title: "Draft", summary: "s", body: "b", status: "draft" }) },
  },
}));

const originalFetch = globalThis.fetch;
const originalSecret = process.env.META_APP_SECRET;

beforeEach(() => {
  store.messages = [];
  store.ingestAudit = [];
  process.env.META_APP_SECRET = "webhook-secret";
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("/messages") ? { messages: [{ id: "wamid.1" }] } : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.META_APP_SECRET;
  else process.env.META_APP_SECRET = originalSecret;
});

function signedRequest(payload: unknown, signature = "valid") {
  const raw = JSON.stringify(payload);
  const digest = createHmac("sha256", "webhook-secret").update(raw).digest("hex");
  return new NextRequest("http://localhost/api/v1/webhooks/inbox/messenger", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signature === "valid" ? `sha256=${digest}` : "sha256=deadbeef" },
    body: raw,
  });
}

describe("Signed inbox webhooks", () => {
  it("rejects an invalid signature before touching the database", async () => {
    const { POST } = await import("@/app/api/v1/webhooks/inbox/[channel]/route");
    const response = await POST(signedRequest({ entry: [] }, "invalid"), { params: Promise.resolve({ channel: "messenger" }) });
    expect(response.status).toBe(401);
    expect(store.messages.length).toBe(0);
  });

  it("ingests a signed Messenger event idempotently", async () => {
    const payload = {
      entry: [{ changes: [{ value: {
        page_id: "PAGE-1",
        sender: { id: "USER-1" },
        message: { text: "Hello from Messenger" },
      } }] }],
    };
    const { POST } = await import("@/app/api/v1/webhooks/inbox/[channel]/route");
    const first = await POST(signedRequest(payload), { params: Promise.resolve({ channel: "messenger" }) });
    expect(first.status).toBe(200);
    expect(store.messages.length).toBe(1);
    const second = await POST(signedRequest(payload), { params: Promise.resolve({ channel: "messenger" }) });
    expect(second.status).toBe(200);
    expect(store.messages.length).toBe(1);
  });

  it("ignores events from unknown accounts", async () => {
    const payload = { entry: [{ changes: [{ value: { page_id: "UNKNOWN", sender: { id: "U" }, message: { text: "hi" } } }] }] };
    const { POST } = await import("@/app/api/v1/webhooks/inbox/[channel]/route");
    const response = await POST(signedRequest(payload), { params: Promise.resolve({ channel: "messenger" }) });
    const body = await response.json();
    expect(body.data.results[0].outcome).toBe("unknown_account");
  });
});

describe("Official adapter sends with mocked provider responses", () => {
  it("uses the WhatsApp Cloud API and confirms a provider ID", async () => {
    const { getInboxAdapter } = await import("@/lib/inbox/adapters");
    const adapter = getInboxAdapter("whatsapp")!;
    const result = await adapter.send({
      conversationId: "conv1",
      externalThreadId: "8801711660955",
      accountId: "acc1",
      to: "8801711660955",
      body: "test",
    });
    expect(result.actuallySent).toBe(true);
    expect(result.providerMessageId).toBe("wamid.1");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("graph.facebook.com"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("records Graph API rejection as a failure, not a success", async () => {
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 400 })) as unknown as typeof fetch;
    const { getInboxAdapter } = await import("@/lib/inbox/adapters");
    const result = await getInboxAdapter("messenger")!.send({
      conversationId: "conv1", externalThreadId: "USER-1", accountId: "acc1", to: "USER-1", body: "test",
    });
    expect(result.actuallySent).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/rejected/i);
  });
});

describe("Private attachment validation", () => {
  it("accepts real text bytes and rejects disguised content", async () => {
    const { prepareInboxAttachment } = await import("@/lib/inbox/attachment-storage");
    const valid = await prepareInboxAttachment(new File(["hello"], "note.txt", { type: "text/plain" }));
    expect(valid.storageKey).toMatch(/\.txt$/);
    expect(valid.size).toBe(5);
    await expect(prepareInboxAttachment(new File([new Uint8Array([0, 1, 2])], "bad.txt", { type: "text/plain" })))
      .rejects.toMatchObject({ code: "content_mismatch" });
    await expect(prepareInboxAttachment(new File(["x"], "bad.exe", { type: "application/octet-stream" })))
      .rejects.toMatchObject({ code: "unsupported_type" });
  });
});

describe("Authenticated CMS draft preview", () => {
  it("returns a noindex preview without changing publication state", async () => {
    const { GET } = await import("@/app/api/v1/admin/cms/entries/[id]/preview/route");
    const response = await GET(new NextRequest("http://localhost/preview"), { params: Promise.resolve({ id: "e1" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(await response.text()).toContain("Preview — not published");
  });
});

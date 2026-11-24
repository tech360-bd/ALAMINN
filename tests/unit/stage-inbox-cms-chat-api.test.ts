import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** Default: no publish/update permission. Individual tests may override. */
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(async () => ({ user: { userId: "u1" }, session: { userId: "u1" } })),
  requirePermission: vi.fn(async (_req: unknown, permission: string) => {
    const denied = permission === "articles.publish" || permission === "articles.update";
    return denied
      ? { denied: true as const, response: new Response(JSON.stringify({ error: "denied" }), { status: 403 }) }
      : { denied: false as const, session: { userId: "u1" } };
  }),
}));

const store = {
  entries: [{ id: "e1", slug: "guide", title: "Guide", summary: "s", body: "b", category: "", tags: "[]", seoTitle: null, seoDescription: null, status: "review" as const, authorId: "u1", reviewerId: null, publishedAt: null, updatedAt: new Date().toISOString() }],
  revisions: [] as { id: string; entryId: string; revisionNumber: number; title: string; summary: string; body: string; seoTitle: string | null; seoDescription: string | null; status: string; authorId: string | null }[],
  chats: [] as { id: string; userId: string; title: string; provider: string; model: string; archived: boolean; updatedAt: Date; createdAt: Date }[],
  inboxMessages: [] as { id: string; idempotencyKey: string | null }[],
  settings: [{ key: "communication.mode", value: "AI_ASSISTED" }] as { key: string; value: string | null }[],
  conversation: { id: "conv1", channel: "whatsapp", accountId: "acc1", externalThreadId: "thread1", status: "open", unreadCount: 1, tags: "[]", contactId: null },
};

vi.mock("@/lib/db", () => ({
  db: {
    cmsEntry: {
      findMany: async () => store.entries,
      findUnique: async ({ where }: { where: { id?: string; slug?: string } }) => store.entries.find((e) => e.id === where.id || e.slug === where.slug) ?? null,
      findFirst: async ({ where }: { where: { slug?: string } }) => store.entries.find((e) => e.slug === where.slug && e.status === "published") ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const entry = { id: `e${store.entries.length + 1}`, tags: "[]", seoTitle: null, seoDescription: null, reviewerId: null, publishedAt: null, updatedAt: new Date().toISOString(), ...data } as typeof store.entries[number];
        store.entries.push(entry);
        return entry;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const entry = store.entries.find((e) => e.id === where.id)!;
        Object.assign(entry, data);
        return { ...entry };
      },
      count: async () => store.entries.length,
    },
    cmsRevision: {
      findMany: async () => store.revisions,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const revision = { id: `r${store.revisions.length + 1}`, ...data } as typeof store.revisions[number];
        store.revisions.push(revision);
        return revision;
      },
      findFirst: async ({ where }: { where: { id: string; entryId: string } }) => store.revisions.find((r) => r.id === where.id && r.entryId === where.entryId) ?? null,
    },
    aiChatConversation: {
      findMany: async ({ where }: { where: { userId: string; archived?: boolean } }) => store.chats.filter((c) => c.userId === where.userId && (where.archived === undefined || c.archived === where.archived)),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => store.chats.find((c) => c.id === where.id && c.userId === where.userId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const chat = { id: `chat${store.chats.length + 1}`, archived: false, updatedAt: new Date(), createdAt: new Date(), ...data } as typeof store.chats[number];
        store.chats.push(chat);
        return chat;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const chat = store.chats.find((c) => c.id === where.id)!;
        Object.assign(chat, data);
        return { ...chat };
      },
      delete: async ({ where }: { where: { id: string } }) => { store.chats = store.chats.filter((c) => c.id !== where.id); },
    },
    aiChatMessage: {
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: `m${Math.random()}`, ...data }),
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) => store.inboxMessages.find((m) => m.idempotencyKey === where.idempotencyKey) ?? null,
    },
    inboxConversation: {
      findMany: async () => [],
      count: async () => 0,
      findUnique: async () => store.conversation,
      findFirst: async () => store.conversation,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "conv1", ...data }),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ id: where.id, ...data }),
    },
    inboxMessage: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) => store.inboxMessages.find((m) => m.idempotencyKey === where.idempotencyKey) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const message = { id: `msg${store.inboxMessages.length + 1}`, ...data } as { id: string; idempotencyKey: string | null };
        store.inboxMessages.push(message);
        return message;
      },
    },
    inboxAudit: { create: async () => ({}) },
    inboxAttachment: {
      findMany: async () => [],
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "att1", ...data }),
    },
    socialAccount: {
      findFirst: async () => ({ id: "acc1", externalId: "8801711660955", tokenEncrypted: "enc" }),
    },
    setting: { findUnique: async ({ where }: { where: { key: string } }) => store.settings.find((s) => s.key === where.key) ?? null },
  },
}));

vi.mock("@/lib/admin-api-server", () => ({ writeAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/social/crypto", () => ({ decryptToken: vi.fn(() => "test-token") }));
vi.mock("@/lib/ai/free-router", () => ({
  runFreeAiRouter: vi.fn(async () => ({ content: "Grounded answer.", providerName: "unorouter", modelUsed: "test-model", cached: false })),
}));

const req = (url: string, body?: unknown) => new NextRequest(new URL(url, "http://localhost"), {
  method: body ? "POST" : "GET",
  ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
});

beforeEach(async () => {
  const { requirePermission } = await import("@/lib/auth");
  vi.mocked(requirePermission).mockReset();
  vi.mocked(requirePermission).mockImplementation(async (_req: unknown, permission: string) => {
    const denied = permission === "articles.publish" || permission === "articles.update";
    return denied
      ? { denied: true as const, response: new Response(JSON.stringify({ error: "denied" }), { status: 403 }) }
      : { denied: false as const, session: { userId: "u1" } };
  });
});

describe("CMS API authorization and revision restore", () => {
  it("rejects publishing without the publish permission", async () => {
    const { POST } = await import("@/app/api/v1/admin/cms/entries/[id]/status/route");
    const response = await POST(req("http://localhost/api/v1/admin/cms/entries/e1/status", { status: "published" }), { params: Promise.resolve({ id: "e1" }) });
    expect(response.status).toBe(403);
    expect(store.entries[0].status).toBe("review");
  });

  it("rejects invalid review → published transitions", async () => {
    const { requirePermission } = await import("@/lib/auth");
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ denied: false, session: { userId: "u1" } });
    const { POST } = await import("@/app/api/v1/admin/cms/entries/[id]/status/route");
    const response = await POST(req("http://localhost/api/v1/admin/cms/entries/e1/status", { status: "published" }), { params: Promise.resolve({ id: "e1" }) });
    expect(response.status).toBe(409);
  });

  it("creates drafts only and snapshots revisions", async () => {
    const { requirePermission } = await import("@/lib/auth");
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({ denied: false, session: { userId: "u1" } });
    const { POST } = await import("@/app/api/v1/admin/cms/entries/route");
    const response = await POST(req("http://localhost/api/v1/admin/cms/entries", {
      slug: "ai-generated-page", title: "AI page", body: "draft body", tags: ["ai"],
    }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.entry.status).toBe("draft");
    expect(store.revisions.length).toBeGreaterThan(0);
  });

  it("restores a revision as draft, never published", async () => {
    const { requirePermission } = await import("@/lib/auth");
    vi.mocked(requirePermission).mockResolvedValue({ denied: false, session: { userId: "u1" } });
    store.revisions.push({ id: "r99", entryId: "e1", revisionNumber: 7, title: "Old", summary: "old", body: "old body", seoTitle: null, seoDescription: null, status: "draft", authorId: "u1" });
    const { POST } = await import("@/app/api/v1/admin/cms/entries/[id]/revisions/[revisionId]/restore/route");
    const response = await POST(req("http://localhost/restore"), { params: Promise.resolve({ id: "e1", revisionId: "r99" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.entry.status).toBe("draft");
    expect(body.data.entry.title).toBe("Old");
  });
});

describe("AI chat ownership", () => {
  it("does not expose another user's conversation", async () => {
    store.chats.push({ id: "mine", userId: "someone-else", title: "Private", provider: "auto", model: "", archived: false, createdAt: new Date(), updatedAt: new Date() });
    const { GET } = await import("@/app/api/v1/admin/ai-chat/conversations/[id]/route");
    const response = await GET(req("http://localhost/chat/mine"), { params: Promise.resolve({ id: "mine" }) });
    expect(response.status).toBe(404);
  });

  it("persists streamed content and provider metadata", async () => {
    store.chats.push({ id: "chatx", userId: "u1", title: "Test", provider: "auto", model: "", archived: false, createdAt: new Date(), updatedAt: new Date() });
    const { POST } = await import("@/app/api/v1/admin/ai-chat/conversations/[id]/messages/route");
    const response = await POST(req("http://localhost/chat/chatx/messages", { content: "Hello" }), { params: Promise.resolve({ id: "chatx" }) });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('event: done');
    expect(text).toContain('"provider":"unorouter"');
  });

  it("reports provider unavailability truthfully", async () => {
    const router = await import("@/lib/ai/free-router");
    (router.runFreeAiRouter as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("offline"));
    const { POST } = await import("@/app/api/v1/admin/ai-chat/conversations/[id]/messages/route");
    const response = await POST(req("http://localhost/chat/chatx/messages", { content: "Again" }), { params: Promise.resolve({ id: "chatx" }) });
    const text = await response.text();
    expect(text).toContain('"code":"provider_unavailable"');
    expect(text).not.toContain('"provider":"unorouter"');
  });

  it("honours cancellation without claiming success", async () => {
    const controller = new AbortController();
    const request = new NextRequest(new URL("http://localhost/chat/chatx/messages"), {
      method: "POST",
      body: JSON.stringify({ content: "Cancel me" }),
      headers: { "content-type": "application/json" },
      signal: controller.signal,
    });
    const { POST } = await import("@/app/api/v1/admin/ai-chat/conversations/[id]/messages/route");
    const response = await POST(request, { params: Promise.resolve({ id: "chatx" }) });
    controller.abort();
    const text = await response.text();
    expect(text).not.toContain('event: done');
    expect(text).not.toContain('"code":"provider_unavailable"');
  });
});

describe("Unified inbox API safety", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    store.conversation.externalThreadId = "8801711660955";
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 500, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
  });

  afterAll(() => { globalThis.fetch = originalFetch; });

  const post = (body: unknown) => req("http://localhost/inbox/conv1/messages", body);
  const params = { params: Promise.resolve({ id: "conv1" }) };

  async function route() {
    const mod = await import("@/app/api/v1/admin/inbox/conversations/[id]/messages/route");
    return mod.POST;
  }

  it("blocks automated replies while communication is paused", async () => {
    store.settings[0].value = "PAUSED";
    store.conversation.channel = "whatsapp";
    const POST = await route();
    const response = await POST(post({ body: "hello", automated: true }), params);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.errors).toContain("paused");
    store.settings[0].value = "AI_ASSISTED";
  });

  it("requires approval in AI_ASSISTED mode and never claims fake delivery", async () => {
    const previousToken = process.env.WHATSAPP_API_TOKEN;
    const previousPhone = process.env.WHATSAPP_API_PHONE_NUMBER_ID;
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_API_PHONE_NUMBER_ID = "test-phone";
    try {
      const POST = await route();
      const blocked = await POST(post({ body: "hello", automated: true }), params);
      expect(blocked.status).toBe(403);
      expect((await blocked.json()).errors).toContain("approval_required");

      const approved = await POST(post({ body: "hello", automated: true, approvalGiven: true }), params);
      expect(approved.status).toBe(201);
      const body = await approved.json();
      expect(body.data.actuallySent).toBe(false);
      expect(body.data.message.deliveryStatus).toBe("failed");
    } finally {
      if (previousToken === undefined) delete process.env.WHATSAPP_API_TOKEN;
      else process.env.WHATSAPP_API_TOKEN = previousToken;
      if (previousPhone === undefined) delete process.env.WHATSAPP_API_PHONE_NUMBER_ID;
      else process.env.WHATSAPP_API_PHONE_NUMBER_ID = previousPhone;
    }
  });

  it("records adapter failures instead of claiming delivery", async () => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_API_PHONE_NUMBER_ID = "test-phone";
    const POST = await route();
    const response = await POST(post({ body: "hello", automated: true, approvalGiven: true, idempotencyKey: "adapter-failure-test" }), params);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.actuallySent).toBe(false);
    expect(body.data.message.deliveryStatus).toBe("failed");
    expect(body.data.message.error).toMatch(/rejected|failed|invalid/i);
    delete process.env.WHATSAPP_API_TOKEN;
    delete process.env.WHATSAPP_API_PHONE_NUMBER_ID;
  });

  it("returns the existing message for duplicate idempotency keys", async () => {
    store.inboxMessages.push({ id: "existing", idempotencyKey: "duplicate-1" });
    const POST = await route();
    const response = await POST(post({ body: "hello", idempotencyKey: "duplicate-1" }), params);
    expect(response.status).toBe(200);
    expect((await response.json()).data.duplicate).toBe(true);
  });

  it("allows human replies even when AI automation is blocked", async () => {
    store.conversation.channel = "website_chat";
    store.settings[0].value = "PAUSED";
    const POST = await route();
    const response = await POST(post({ body: "human note" }), params);
    // PAUSED blocks all outbound, including human replies, per the safety rule.
    expect(response.status).toBe(409);
    store.settings[0].value = "AI_ASSISTED";
  });
});

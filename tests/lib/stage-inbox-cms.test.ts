import { describe, expect, it } from "vitest";
import { findContactMatch, makeExternalRef } from "@/lib/inbox/contacts";
import { authorizeOutbound } from "@/lib/inbox/outbound";
import { getCalendarAdapter, getInboxAdapter, ChannelNotConnectedError } from "@/lib/inbox/adapters";
import { canTransition, isValidSlug, nextRevisionNumber, restoredStatus } from "@/lib/cms/state";

const identity = { email: "Student@Example.com", phone: "+880 1711 660 955", externalRef: "whatsapp:123" };
const contacts = [
  { id: "c1", displayName: "Student", email: "student@example.com", phone: null, externalRef: null },
  { id: "c2", displayName: "Other", email: "other@example.com", phone: "+8801711660955", externalRef: null },
  { id: "c3", displayName: "WA", email: null, phone: null, externalRef: "whatsapp:123" },
];

describe("Unified inbox contact matching", () => {
  it("prefers external ref, then email, then phone", () => {
    expect(findContactMatch(contacts, identity)?.id).toBe("c3");
    expect(findContactMatch(contacts, { ...identity, externalRef: null })?.id).toBe("c1");
    expect(findContactMatch(contacts, { email: null, phone: identity.phone })?.id).toBe("c2");
    expect(findContactMatch(contacts, {})).toBeNull();
  });

  it("creates deterministic channel refs", () => {
    expect(makeExternalRef("WHATSAPP", " AbC ")).toBe("whatsapp:abc");
  });
});

describe("Unified outbound authorization", () => {
  const base = { channel: "whatsapp", allowedChannels: ["whatsapp", "email"], external: true, approvalGiven: false };

  it("blocks human mode and paused mode", () => {
    expect(authorizeOutbound({ ...base, mode: "HUMAN_OPERATOR" }).allowed).toBe(false);
    expect(authorizeOutbound({ ...base, mode: "PAUSED" }).reason).toBe("global_communication_paused");
  });

  it("requires approval in assisted mode but not autonomous mode", () => {
    expect(authorizeOutbound({ ...base, mode: "AI_ASSISTED" }).reason).toBe("approval_required");
    expect(authorizeOutbound({ ...base, mode: "AI_ASSISTED", approvalGiven: true }).allowed).toBe(true);
    expect(authorizeOutbound({ ...base, mode: "AI_AUTONOMOUS" }).allowed).toBe(true);
  });

  it("blocks unpermitted channels and keeps internal notes available", () => {
    expect(authorizeOutbound({ ...base, mode: "AI_AUTONOMOUS", channel: "tiktok" }).reason).toBe("channel_not_permitted");
    expect(authorizeOutbound({ ...base, mode: "AI_AUTONOMOUS", external: false, channel: "website_chat" }).allowed).toBe(true);
  });
});

describe("Channel adapter failure handling", () => {
  it("never simulates external delivery", async () => {
    const previous = process.env.WHATSAPP_API_TOKEN;
    delete process.env.WHATSAPP_API_TOKEN;
    const adapter = getInboxAdapter("whatsapp")!;
    expect(adapter.isConnected()).toBe(false);
    await expect(adapter.send({ conversationId: "c", externalThreadId: "t", accountId: "a", body: "hi" }))
      .rejects.toBeInstanceOf(ChannelNotConnectedError);
    if (previous !== undefined) process.env.WHATSAPP_API_TOKEN = previous;
  });

  it("treats website chat as internal and connected", async () => {
    const adapter = getInboxAdapter("website_chat")!;
    expect(adapter.external).toBe(false);
    expect(adapter.isConnected()).toBe(true);
    const result = await adapter.send({ conversationId: "c", externalThreadId: "t", accountId: "a", body: "hi" });
    expect(result.actuallySent).toBe(true);
    expect(result.status).toBe("delivered");
  });

  it("does not create fake calendar events", async () => {
    await expect(getCalendarAdapter("google").createEvent()).rejects.toThrow(/not connected|authorised/i);
  });
});

describe("CMS workflow state machine", () => {
  it("enforces draft → review → approved → published and forbids skipping", () => {
    expect(canTransition("draft", "review")).toBe(true);
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("review", "approved")).toBe(true);
    expect(canTransition("approved", "published")).toBe(true);
    expect(canTransition("published", "draft")).toBe(false);
  });

  it("validates slugs and revises deterministically", () => {
    expect(isValidSlug("higher-study-guide")).toBe(true);
    expect(isValidSlug("Bad_Slug")).toBe(false);
    expect(nextRevisionNumber([{ revisionNumber: 1 }, { revisionNumber: 4 }])).toBe(5);
    expect(restoredStatus()).toBe("draft");
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/social/crypto", () => ({
  decryptToken: (v: string | null) => v ? "test-token" : null,
}));

import { sendWhatsappAccountTemplate } from "@/lib/whatsapp/sender";

describe("sendWhatsappAccountTemplate", () => {
  const originalFetch = global.fetch;
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it("rejects missing template name/language", async () => {
    const res = await sendWhatsappAccountTemplate({ externalId: "123", tokenEncrypted: "enc" }, "+12025550123", { name: "", language: "" });
    expect(res.actuallySent).toBe(false);
    expect(res.error).toMatch(/required/i);
  });

  it("sends approved template payload", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: "wamid.1" }] }) });
    const res = await sendWhatsappAccountTemplate({ externalId: "123", tokenEncrypted: "enc" }, "+12025550123", { name: "hello_world", language: "en_US" });
    expect(res.actuallySent).toBe(true);
    expect(res.messageId).toBe("wamid.1");
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("hello_world");
    expect(body.template.language.code).toBe("en_US");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptToken } from "@/lib/social/crypto";
import { getAdapter } from "@/lib/social/adapters";

const whatsapp = getAdapter("whatsapp");
const originalAuthSecret = process.env.AUTH_SECRET;
const originalGlobalToken = process.env.WHATSAPP_API_TOKEN;
const originalGlobalPhoneId = process.env.WHATSAPP_API_PHONE_NUMBER_ID;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalAuthSecret;
  if (originalGlobalToken === undefined) delete process.env.WHATSAPP_API_TOKEN;
  else process.env.WHATSAPP_API_TOKEN = originalGlobalToken;
  if (originalGlobalPhoneId === undefined) delete process.env.WHATSAPP_API_PHONE_NUMBER_ID;
  else process.env.WHATSAPP_API_PHONE_NUMBER_ID = originalGlobalPhoneId;
});

describe("WhatsApp SocialAccount send isolation", () => {
  it("keeps four WhatsApp accounts isolated by phone ID and encrypted token", async () => {
    process.env.AUTH_SECRET = "account-isolation-test-secret-32-bytes-minimum";
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const phoneId = String(input).match(/phone-number-id-(\d)/)?.[1];
      return new Response(
        JSON.stringify({ messages: [{ id: `wamid.account-${phoneId}.123` }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", request);

    for (const accountNumber of [1, 2, 3, 4]) {
      const result = await whatsapp.sendReply(
        {
          externalId: `phone-number-id-${accountNumber}`,
          tokenEncrypted: encryptToken(`account-${accountNumber}-secret-token`),
        },
        "+880 1711 223344",
        `Hello from account ${accountNumber}`,
      );
      expect(result).toMatchObject({ status: "sent", providerId: `wamid.account-${accountNumber}.123`, actuallySent: true });
    }

    expect(request).toHaveBeenCalledTimes(4);
    request.mock.calls.forEach(([url, init], index) => {
      const accountNumber = index + 1;
      expect(String(url)).toBe(`https://graph.facebook.com/v18.0/phone-number-id-${accountNumber}/messages`);
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer account-${accountNumber}-secret-token`);
      expect(JSON.parse(String(init?.body))).toMatchObject({
        messaging_product: "whatsapp",
        to: "8801711223344",
        text: { body: `Hello from account ${accountNumber}` },
      });
    });
  });

  it("fails closed when the selected account has no credentials, even if legacy global credentials exist", async () => {
    process.env.WHATSAPP_API_TOKEN = "legacy-global-token-must-not-be-used";
    process.env.WHATSAPP_API_PHONE_NUMBER_ID = "legacy-global-phone-id";
    const request = vi.fn();
    vi.stubGlobal("fetch", request);

    const result = await whatsapp.sendReply(
      { externalId: "phone-number-id-one", tokenEncrypted: null },
      "8801711223344",
      "This must not be sent from another number",
    );

    expect(result.status).toBe("failed");
    expect(result.actuallySent).toBe(false);
    expect(result.error).toContain("missing valid credentials");
    expect(request).not.toHaveBeenCalled();
  });

  it("does not report a provider rejection as a sent message", async () => {
    process.env.AUTH_SECRET = "account-isolation-test-secret-32-bytes-minimum";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));

    const result = await whatsapp.sendReply(
      { externalId: "phone-number-id-one", tokenEncrypted: encryptToken("one-token") },
      "8801711223344",
      "Hello",
    );

    expect(result).toMatchObject({ status: "failed", providerId: null, actuallySent: false });
    expect(result.error).toContain("HTTP 403");
  });
});

import { describe, expect, it } from "vitest";
import { normalizeWhatsappNumber } from "@/lib/whatsapp/config";
import { sendWhatsappMessage } from "@/lib/whatsapp/sender";

describe("WhatsApp number normalization", () => {
  it.each([
    ["01716609554", "8801716609554"],
    ["+880 1716-609554", "8801716609554"],
    ["8801716609554", "8801716609554"],
    ["+44 (20) 7946-0018", "442079460018"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeWhatsappNumber(input)).toBe(expected);
  });
  it.each(["", "1", "123456", "0171660955", "+000123456789", "01716609554 ext 1"])("rejects invalid %s", (input) => {
    expect(normalizeWhatsappNumber(input)).toBeNull();
  });
  it("rejects an invalid recipient even when no provider is configured", async () => {
    expect(await sendWhatsappMessage("123", "test")).toMatchObject({ status: "FAILED", actuallySent: false });
  });
});

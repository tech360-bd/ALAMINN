import { describe, expect, it } from "vitest";
import { isWhatsappCustomerServiceWindowOpen, WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS } from "@/lib/whatsapp/policy";

describe("WhatsApp customer-service window", () => {
  it("allows free-form send inside the 24-hour window", () => {
    const now = Date.now();
    expect(isWhatsappCustomerServiceWindowOpen(new Date(now - WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS + 1), now)).toBe(true);
  });
  it("closes at 24 hours and if there is no valid inbound timestamp", () => {
    const now = Date.now();
    expect(isWhatsappCustomerServiceWindowOpen(new Date(now - WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS), now)).toBe(false);
    expect(isWhatsappCustomerServiceWindowOpen(null, now)).toBe(false);
    expect(isWhatsappCustomerServiceWindowOpen(new Date(Number.NaN), now)).toBe(false);
  });
  it("rejects timestamps in the future", () => {
    const now = Date.now();
    expect(isWhatsappCustomerServiceWindowOpen(new Date(now + 1), now)).toBe(false);
  });
});

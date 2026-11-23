import { describe, expect, it } from "vitest";
import { parseInboundWebhook, parseInboundWebhookEvents, parseWhatsappDeliveryUpdates } from "@/lib/whatsapp/sender";

describe("WhatsApp webhook multi-account event parsing", () => {
  it("extracts messages from every entry and change with exact phone-number IDs", () => {
    const payload = {
      entry: [
        { changes: [{ value: {
          metadata: { phone_number_id: "phone-id-1" },
          contacts: [{ profile: { name: "First Customer" } }],
          messages: [
            { id: "wamid.1", from: "8801711000001", timestamp: "1799999999", type: "text", text: { body: "One" } },
            { id: "wamid.2", from: "8801711000002", timestamp: "1799999999", type: "interactive", interactive: { button_reply: { title: "Two" } } },
          ],
        } }] },
        { changes: [{ value: {
          metadata: { phone_number_id: "phone-id-2" },
          messages: [{ id: "wamid.3", from: "8801711000003", timestamp: "1799999999", type: "button", button: { text: "Three" } }],
        } }] },
      ],
    };

    const events = parseInboundWebhookEvents(payload);
    expect(events).toHaveLength(3);
    expect(events.map((event) => [event.messageId, event.accountExternalId, event.text])).toEqual([
      ["wamid.1", "phone-id-1", "One"],
      ["wamid.2", "phone-id-1", "Two"],
      ["wamid.3", "phone-id-2", "Three"],
    ]);
    expect(events[0].participantName).toBe("First Customer");
    expect(parseInboundWebhook(payload)?.messageId).toBe("wamid.1");
  });

  it("extracts delivery status callbacks from every entry", () => {
    const payload = { entry: [
      { changes: [{ value: { statuses: [{ id: "wamid.sent", status: "sent" }, { id: "wamid.read", status: "read" }] } }] },
      { changes: [{ value: { statuses: [{ id: "wamid.failed", status: "failed" }] } }] },
    ] };
    expect(parseWhatsappDeliveryUpdates(payload)).toEqual([
      { messageId: "wamid.sent", status: "sent" },
      { messageId: "wamid.read", status: "read" },
      { messageId: "wamid.failed", status: "failed" },
    ]);
  });
});

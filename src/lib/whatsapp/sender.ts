/**
 * WhatsApp Cloud API — Message Sender
 * ===================================
 * Sends text messages through Meta's official WhatsApp Business Cloud API.
 * The legacy global sender remains for explicit single-number integrations;
 * account-managed inbox sends must use sendWhatsappAccountMessage instead.
 */
import { whatsappConfig, normalizeWhatsappNumber, type WhatsappMessageStatus } from "./config";
import { decryptToken } from "@/lib/social/crypto";

export type SendResult = {
  status: WhatsappMessageStatus;
  messageId: string | null;
  error: string | null;
  actuallySent: boolean;
};

export async function sendWhatsappMessage(to: string, text: string): Promise<SendResult> {
  const normalized = normalizeWhatsappNumber(to);
  if (!normalized) return { status: "FAILED", messageId: null, error: "Invalid recipient number", actuallySent: false };
  const cfg = whatsappConfig();
  if (!cfg.apiConfigured || !cfg.apiToken || !cfg.apiPhoneNumberId) {
    return { status: "PENDING", messageId: `dev-${Date.now()}-${normalized.slice(-4)}`, error: null, actuallySent: false };
  }
  const body = text.length > 4096 ? `${text.slice(0, 4093)}...` : text;
  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${encodeURIComponent(cfg.apiPhoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: normalized, type: "text", text: { preview_url: false, body } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { status: "FAILED", messageId: null, error: `WhatsApp Cloud API rejected the send (HTTP ${res.status}).`, actuallySent: false };
    const data = await res.json() as { messages?: { id?: string }[] };
    const messageId = data.messages?.[0]?.id ?? null;
    if (!messageId) return { status: "FAILED", messageId: null, error: "WhatsApp Cloud API did not confirm a message ID.", actuallySent: false };
    return { status: "SENT", messageId, error: null, actuallySent: true };
  } catch {
    return { status: "FAILED", messageId: null, error: "WhatsApp Cloud API request failed.", actuallySent: false };
  }
}

/** Send only through explicitly selected SocialAccount credentials; never use global fallback. */
export async function sendWhatsappAccountMessage(
  account: { externalId: string; tokenEncrypted: string | null },
  to: string,
  text: string
): Promise<SendResult> {
  const phoneNumberId = account.externalId.trim();
  const token = decryptToken(account.tokenEncrypted);
  const normalized = normalizeWhatsappNumber(to);
  if (!phoneNumberId || !token || !normalized) {
    return {
      status: "FAILED", messageId: null,
      error: !phoneNumberId || !token ? "Selected WhatsApp account is missing valid credentials." : "Invalid recipient number.",
      actuallySent: false,
    };
  }
  const body = text.length > 4096 ? `${text.slice(0, 4093)}...` : text;
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: normalized, type: "text", text: { preview_url: false, body } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { status: "FAILED", messageId: null, error: `WhatsApp Cloud API rejected the send (HTTP ${response.status}).`, actuallySent: false };
    const data = await response.json() as { messages?: { id?: string }[] };
    const messageId = data.messages?.[0]?.id ?? null;
    if (!messageId) return { status: "FAILED", messageId: null, error: "WhatsApp Cloud API did not confirm a message ID.", actuallySent: false };
    return { status: "SENT", messageId, error: null, actuallySent: true };
  } catch {
    return { status: "FAILED", messageId: null, error: "WhatsApp Cloud API request failed.", actuallySent: false };
  }
}

export type WhatsappTemplateComponent = {
  type: "header" | "body" | "button";
  sub_type?: "quick_reply" | "url";
  index?: string | number;
  parameters?: Array<{ type: "text" | "image" | "document" | "video"; text?: string; image?: { link: string }; document?: { link: string; filename?: string }; video?: { link: string } }>;
};

/** Send an approved WhatsApp template through explicitly selected account credentials. */
export async function sendWhatsappAccountTemplate(
  account: { externalId: string; tokenEncrypted: string | null },
  to: string,
  template: { name: string; language: string; components?: WhatsappTemplateComponent[] }
): Promise<SendResult> {
  const phoneNumberId = account.externalId.trim();
  const token = decryptToken(account.tokenEncrypted);
  const normalized = normalizeWhatsappNumber(to);
  if (!phoneNumberId || !token) {
    return { status: "FAILED", messageId: null, error: "Selected WhatsApp account is missing valid credentials.", actuallySent: false };
  }
  if (!normalized) return { status: "FAILED", messageId: null, error: "Invalid recipient number.", actuallySent: false };
  const name = String(template.name || "").trim();
  const language = String(template.language || "").trim();
  if (!name || !language) return { status: "FAILED", messageId: null, error: "Template name and language are required.", actuallySent: false };
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalized,
        type: "template",
        template: {
          name,
          language: { code: language },
          ...(Array.isArray(template.components) && template.components.length > 0 ? { components: template.components } : {}),
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { status: "FAILED", messageId: null, error: `WhatsApp Cloud API rejected the template send (HTTP ${response.status}).`, actuallySent: false };
    const data = await response.json() as { messages?: { id?: string }[] };
    const messageId = data.messages?.[0]?.id ?? null;
    if (!messageId) return { status: "FAILED", messageId: null, error: "WhatsApp Cloud API did not confirm a message ID.", actuallySent: false };
    return { status: "SENT", messageId, error: null, actuallySent: true };
  } catch {
    return { status: "FAILED", messageId: null, error: "WhatsApp Cloud API request failed.", actuallySent: false };
  }
}

export type InboundMessage = {
  from: string;
  text: string;
  messageId: string;
  timestamp: string;
  type: "text" | "button" | "interactive" | "unknown";
  accountExternalId?: string;
  participantName?: string;
};

export type WhatsappDeliveryUpdate = { messageId: string; status: string };

/** Extract every text/button/interactive inbound message from all Meta entries and changes. */
export function parseInboundWebhookEvents(payload: unknown): InboundMessage[] {
  const events: InboundMessage[] = [];
  try {
    const p = payload as { entry?: Array<{ id?: string; changes?: Array<{ value?: {
      metadata?: { phone_number_id?: string };
      contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
      messages?: Array<{
        from?: string; id?: string; timestamp?: string; type?: string;
        text?: { body?: string }; button?: { text?: string };
        interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
      }>;
    } }> }> };
    for (const entry of p.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        for (const msg of value?.messages ?? []) {
          if (!msg.from) continue;
          let text = "";
          let type: InboundMessage["type"] = "unknown";
          if (msg.type === "text" && msg.text?.body) { text = msg.text.body; type = "text"; }
          else if (msg.type === "button" && msg.button?.text) { text = msg.button.text; type = "button"; }
          else if (msg.type === "interactive") {
            text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "";
            type = "interactive";
          }
          const contact = value?.contacts?.find((item) => item.wa_id === msg.from)
            ?? (value?.contacts?.length === 1 ? value.contacts[0] : undefined);
          events.push({
            from: msg.from, text, messageId: msg.id || "",
            timestamp: msg.timestamp || String(Math.floor(Date.now() / 1000)), type,
            accountExternalId: value?.metadata?.phone_number_id,
            participantName: contact?.profile?.name,
          });
        }
      }
    }
  } catch { return []; }
  return events;
}

/** Extract provider delivery/read/failure receipts from all changes. */
export function parseWhatsappDeliveryUpdates(payload: unknown): WhatsappDeliveryUpdate[] {
  const updates: WhatsappDeliveryUpdate[] = [];
  try {
    const p = payload as { entry?: Array<{ changes?: Array<{ value?: { statuses?: Array<{ id?: string; status?: string }> } }> }> };
    for (const entry of p.entry ?? []) for (const change of entry.changes ?? []) for (const status of change.value?.statuses ?? []) {
      if (status.id && status.status) updates.push({ messageId: status.id, status: status.status });
    }
  } catch { return []; }
  return updates;
}

/** Backwards-compatible first-message parser for existing callers. */
export function parseInboundWebhook(payload: unknown): InboundMessage | null {
  return parseInboundWebhookEvents(payload).find((message) => !!message.from) ?? null;
}

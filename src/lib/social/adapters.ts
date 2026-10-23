/** Platform adapter interface — official APIs only. Dev mode = no real send when token missing. */
import { decryptToken } from "./crypto";
import { sendWhatsappMessage } from "@/lib/whatsapp/sender";
export type SendOut = { status: "sent" | "failed" | "dev_pending"; providerId: string | null; error: string | null; actuallySent: boolean };
export interface PlatformAdapter {
  platform: string;
  capabilities: string[];
  sendReply(account: { externalId: string; tokenEncrypted: string | null }, to: string, text: string): Promise<SendOut>;
  publish(account: { externalId: string; tokenEncrypted: string | null }, body: string, mediaUrls: string[]): Promise<SendOut>;
  health(account: { externalId: string; tokenEncrypted: string | null }): Promise<{ ok: boolean; error: string | null }>;
}
async function graph(path: string, token: string, body: unknown): Promise<Response> {
  return fetch(`https://graph.facebook.com/v21.0/${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
const facebook: PlatformAdapter = {
  platform: "facebook", capabilities: ["publish", "inbox", "comments"],
  async sendReply(a, to, text) { const t = decryptToken(a.tokenEncrypted); if (!t) return { status: "dev_pending", providerId: null, error: null, actuallySent: false };
    try { const r = await graph(`${a.externalId}/messages`, t, { recipient: { id: to }, message: { text } }); if (!r.ok) return { status: "failed", providerId: null, error: `Graph ${r.status}`, actuallySent: false }; const j = await r.json(); return { status: "sent", providerId: j.message_id ?? null, error: null, actuallySent: true }; } catch (e) { return { status: "failed", providerId: null, error: String(e), actuallySent: false }; } },
  async publish(a, body) { const t = decryptToken(a.tokenEncrypted); if (!t) return { status: "dev_pending", providerId: null, error: null, actuallySent: false };
    try { const r = await graph(`${a.externalId}/feed`, t, { message: body }); if (!r.ok) return { status: "failed", providerId: null, error: `Graph ${r.status}`, actuallySent: false }; const j = await r.json(); return { status: "sent", providerId: j.id ?? null, error: null, actuallySent: true }; } catch (e) { return { status: "failed", providerId: null, error: String(e), actuallySent: false }; } },
  async health(a) { const t = decryptToken(a.tokenEncrypted); if (!t) return { ok: false, error: "no_token" }; try { const r = await fetch(`https://graph.facebook.com/v21.0/${a.externalId}?fields=id,name`, { headers: { Authorization: `Bearer ${t}` } }); return { ok: r.ok, error: r.ok ? null : `Graph ${r.status}` }; } catch (e) { return { ok: false, error: String(e) }; } },
};
const whatsapp: PlatformAdapter = {
  platform: "whatsapp", capabilities: ["inbox"],
  async sendReply(_a, to, text) { const r = await sendWhatsappMessage(to, text); return { status: r.status === "FAILED" ? "failed" : r.actuallySent ? "sent" : "dev_pending", providerId: r.messageId, error: r.error, actuallySent: r.actuallySent }; },
  async publish() { return { status: "failed", providerId: null, error: "WhatsApp does not support feed publishing", actuallySent: false }; },
  async health(a) { return { ok: !!decryptToken(a.tokenEncrypted) || !!process.env.WHATSAPP_API_TOKEN, error: null }; },
};
const instagram: PlatformAdapter = { ...facebook, platform: "instagram", capabilities: ["publish", "comments"] };
const unsupported = (p: string): PlatformAdapter => ({ platform: p, capabilities: [], sendReply: async () => ({ status: "failed", providerId: null, error: `${p} adapter not yet enabled`, actuallySent: false }), publish: async () => ({ status: "failed", providerId: null, error: `${p} publishing not supported`, actuallySent: false }), health: async () => ({ ok: false, error: "adapter_not_enabled" }) });
const REG: Record<string, PlatformAdapter> = { facebook, whatsapp, instagram, youtube: unsupported("youtube"), linkedin: unsupported("linkedin"), tiktok: unsupported("tiktok") };
export function getAdapter(platform: string): PlatformAdapter { return REG[platform] ?? unsupported(platform); }
export const SUPPORTED_PLATFORMS = Object.keys(REG);

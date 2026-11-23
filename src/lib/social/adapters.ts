/** Platform adapter interface — official APIs only. Dev mode = no real send when token missing. */
import { decryptToken } from "./crypto";
import { sendWhatsappAccountMessage } from "@/lib/whatsapp/sender";
export type SendOut = { status: "sent" | "failed" | "dev_pending"; providerId: string | null; error: string | null; actuallySent: boolean };
export interface PlatformAdapter {
  platform: string;
  capabilities: string[];
  sendReply(account: { externalId: string; tokenEncrypted: string | null }, to: string, text: string): Promise<SendOut>;
  publish(account: { externalId: string; tokenEncrypted: string | null }, body: string, mediaUrls: string[]): Promise<SendOut>;
  health(account: { externalId: string; tokenEncrypted: string | null }): Promise<{ ok: boolean; error: string | null }>;
}
async function graph(path: string, token: string, body: unknown): Promise<Response> {
  return fetch(`https://graph.facebook.com/v21.0/${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
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
  platform: "whatsapp", capabilities: ["inbox", "send"],
  async sendReply(a, to, text) {
    const result = await sendWhatsappAccountMessage(a, to, text);
    return {
      status: result.actuallySent ? "sent" : "failed",
      providerId: result.messageId,
      error: result.error,
      actuallySent: result.actuallySent,
    };
  },
  async publish() { return { status: "failed", providerId: null, error: "WhatsApp does not support feed publishing", actuallySent: false }; },
  async health(a) {
    const token = decryptToken(a.tokenEncrypted);
    if (!token || !a.externalId.trim()) return { ok: false, error: "account_credentials_missing" };
    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${encodeURIComponent(a.externalId)}?fields=id,display_phone_number`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      return { ok: response.ok, error: response.ok ? null : `WhatsApp Cloud API health check failed (HTTP ${response.status}).` };
    } catch {
      return { ok: false, error: "WhatsApp Cloud API health check failed." };
    }
  },
};
const instagram: PlatformAdapter = {
  platform: "instagram", capabilities: ["publish", "comments"],
  async sendReply(a, to, text) {
    const token = decryptToken(a.tokenEncrypted); if (!token) return { status: "failed", providerId: null, error: "No account token", actuallySent: false };
    try { const r = await graph(`${a.externalId}/messages`, token, { recipient: { id: to }, message: { text } }); const j = await r.json(); return { status: r.ok && j.message_id ? "sent" : "failed", providerId: j.message_id || null, error: r.ok ? null : `Graph ${r.status}`, actuallySent: r.ok && !!j.message_id }; } catch { return { status: "failed", providerId: null, error: "Instagram reply request failed", actuallySent: false }; }
  },
  async publish(a, body, mediaUrls) {
    const token = decryptToken(a.tokenEncrypted); if (!token) return { status: "failed", providerId: null, error: "No account token", actuallySent: false };
    const image = mediaUrls[0]; if (!image || !image.startsWith("https://")) return { status: "failed", providerId: null, error: "Instagram requires a public HTTPS image URL", actuallySent: false };
    try {
      const container = await graph(`${a.externalId}/media`, token, { image_url: image, caption: body }); const c = await container.json();
      if (!container.ok || !c.id) return { status: "failed", providerId: null, error: `Instagram media container failed (${container.status})`, actuallySent: false };
      // Image containers must be ready before media_publish.
      let ready = false;
      for (let i = 0; i < 5; i++) { const r = await fetch(`https://graph.facebook.com/v21.0/${c.id}?fields=status_code`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }); const status = await r.json(); if (status.status_code === "FINISHED") { ready = true; break; } if (status.status_code === "ERROR") break; await new Promise(resolve => setTimeout(resolve, 2000)); }
      if (!ready) return { status: "failed", providerId: null, error: "Instagram image processing did not finish", actuallySent: false };
      const published = await graph(`${a.externalId}/media_publish`, token, { creation_id: c.id }); const j = await published.json();
      return { status: published.ok && j.id ? "sent" : "failed", providerId: j.id || null, error: published.ok ? null : `Instagram publish failed (${published.status})`, actuallySent: published.ok && !!j.id };
    } catch { return { status: "failed", providerId: null, error: "Instagram publishing request failed", actuallySent: false }; }
  },
  async health(a) { const token = decryptToken(a.tokenEncrypted); if (!token) return { ok: false, error: "no_token" }; try { const r = await fetch(`https://graph.facebook.com/v21.0/${a.externalId}?fields=id,username`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }); return { ok: r.ok, error: r.ok ? null : `Graph ${r.status}` }; } catch { return { ok: false, error: "Instagram health request failed" }; } },
};
const unsupported = (p: string): PlatformAdapter => ({ platform: p, capabilities: [], sendReply: async () => ({ status: "failed", providerId: null, error: `${p} adapter not yet enabled`, actuallySent: false }), publish: async () => ({ status: "failed", providerId: null, error: `${p} publishing not supported`, actuallySent: false }), health: async () => ({ ok: false, error: "adapter_not_enabled" }) });
const REG: Record<string, PlatformAdapter> = { facebook, whatsapp, instagram, youtube: unsupported("youtube"), linkedin: unsupported("linkedin"), tiktok: unsupported("tiktok") };
export function getAdapter(platform: string): PlatformAdapter { return REG[platform] ?? unsupported(platform); }
export const SUPPORTED_PLATFORMS = Object.keys(REG);

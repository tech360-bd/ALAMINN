/**
 * Typed channel adapters for the unified inbox.
 *
 * Every adapter uses an official provider API and the credentials already
 * stored in `SocialAccount` (or an explicitly documented env configuration for
 * email). An adapter only reports `connected` when the required credential is
 * present. Missing credentials throw `ChannelNotConnectedError`; a send that
 * cannot be confirmed is recorded as `failed` with `actuallySent: false`.
 *
 * No adapter fabricates a provider message ID or a delivery confirmation.
 */
import { db } from "@/lib/db";
import { decryptToken } from "@/lib/social/crypto";
import { sendWhatsappAccountMessage } from "@/lib/whatsapp/sender";
import { sendEmail } from "@/lib/email/router";

export type InboxChannel =
  | "email"
  | "whatsapp"
  | "messenger"
  | "instagram"
  | "website_chat"
  | "linkedin"
  | "social";

export interface OutboundMessage {
  conversationId: string;
  externalThreadId: string;
  accountId: string;
  body: string;
  /** Recipient phone/PSID/email when the channel requires one. */
  to?: string;
  subject?: string;
  attachments?: { name: string; url: string; mimeType?: string; size?: number }[];
}

export interface AdapterSendResult {
  actuallySent: boolean;
  status: "sent" | "delivered" | "failed";
  providerMessageId?: string;
  error?: string;
}

export class ChannelNotConnectedError extends Error {
  constructor(public readonly channel: InboxChannel) {
    super(`Channel ${channel} is not connected. Configure official credentials first.`);
    this.name = "ChannelNotConnectedError";
  }
}

export interface InboxChannelAdapter {
  channel: InboxChannel;
  external: boolean;
  requiredScopes: readonly string[];
  isConnected(): boolean;
  send(message: OutboundMessage): Promise<AdapterSendResult>;
}

function envPresent(...keys: string[]): boolean {
  return keys.every((key) => Boolean(process.env[key]?.trim()));
}

async function accountToken(accountId: string, platform: string) {
  const account = await db.socialAccount.findFirst({
    where: { id: accountId, platform },
    select: { id: true, externalId: true, tokenEncrypted: true },
  });
  if (!account) {
    throw new ChannelNotConnectedError(
      platform === "facebook" ? "messenger" : (platform as InboxChannel)
    );
  }
  const token = decryptToken(account.tokenEncrypted);
  if (!token || !account.externalId.trim()) {
    throw new ChannelNotConnectedError(
      platform === "facebook" ? "messenger" : (platform as InboxChannel)
    );
  }
  return { ...account, token };
}

async function graphSend(
  path: string,
  token: string,
  body: unknown
): Promise<AdapterSendResult> {
  const response = await fetch(`https://graph.facebook.com/v21.0/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    return { actuallySent: false, status: "failed", error: `Official Graph API rejected the send (HTTP ${response.status}).` };
  }
  const data = (await response.json()) as { id?: string; message_id?: string };
  const providerMessageId = data.message_id || data.id;
  if (!providerMessageId) {
    return { actuallySent: false, status: "failed", error: "Provider did not confirm a message ID." };
  }
  return { actuallySent: true, status: "sent", providerMessageId };
}

/** Website chat is internal: delivery is a local DB state, not an external API call. */
const websiteChatAdapter: InboxChannelAdapter = {
  channel: "website_chat",
  external: false,
  requiredScopes: [],
  isConnected: () => true,
  async send() {
    return { actuallySent: true, status: "delivered" };
  },
};

const emailAdapter: InboxChannelAdapter = {
  channel: "email",
  external: true,
  requiredScopes: ["provider send scope"],
  isConnected: () => envPresent("RESEND_API_KEY") || (envPresent("SMTP_HOST", "SMTP_USER", "SMTP_PASS")),
  async send(message) {
    if (!emailAdapter.isConnected()) throw new ChannelNotConnectedError("email");
    if (!message.to) return { actuallySent: false, status: "failed", error: "Recipient email is missing." };
    const result = await sendEmail(message.to, {
      subject: message.subject || "Re: your enquiry",
      text: message.body,
      html: `<p>${message.body.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] ?? char))}</p>`,
    });
    return result.actuallySent
      ? { actuallySent: true, status: "sent", providerMessageId: result.messageId ?? undefined }
      : { actuallySent: false, status: "failed", error: result.error || "Email provider did not confirm delivery." };
  },
};

const whatsappAdapter: InboxChannelAdapter = {
  channel: "whatsapp",
  external: true,
  requiredScopes: ["whatsapp_business_messaging"],
  isConnected: () => envPresent("META_APP_SECRET") || envPresent("WHATSAPP_API_TOKEN", "WHATSAPP_API_PHONE_NUMBER_ID"),
  async send(message) {
    if (!whatsappAdapter.isConnected()) throw new ChannelNotConnectedError("whatsapp");
    const account = await accountToken(message.accountId, "whatsapp");
    const result = await sendWhatsappAccountMessage(
      { externalId: account.externalId, tokenEncrypted: account.tokenEncrypted },
      message.to || message.externalThreadId,
      message.body
    );
    return result.actuallySent
      ? { actuallySent: true, status: "sent", providerMessageId: result.messageId ?? undefined }
      : { actuallySent: false, status: "failed", error: result.error || "WhatsApp Cloud API did not confirm delivery." };
  },
};

const messengerAdapter: InboxChannelAdapter = {
  channel: "messenger",
  external: true,
  requiredScopes: ["pages_messaging"],
  isConnected: () => envPresent("META_APP_SECRET"),
  async send(message) {
    if (!messengerAdapter.isConnected()) throw new ChannelNotConnectedError("messenger");
    const account = await accountToken(message.accountId, "facebook");
    if (!message.to) return { actuallySent: false, status: "failed", error: "Messenger recipient PSID is missing." };
    return graphSend(`${account.externalId}/messages`, account.token, {
      recipient: { id: message.to },
      message: { text: message.body },
    });
  },
};

const instagramAdapter: InboxChannelAdapter = {
  channel: "instagram",
  external: true,
  requiredScopes: ["instagram_manage_messages"],
  isConnected: () => envPresent("META_APP_SECRET"),
  async send(message) {
    if (!instagramAdapter.isConnected()) throw new ChannelNotConnectedError("instagram");
    const account = await accountToken(message.accountId, "instagram");
    if (!message.to) return { actuallySent: false, status: "failed", error: "Instagram recipient ID is missing." };
    return graphSend(`${account.externalId}/messages`, account.token, {
      recipient: { id: message.to },
      message: { text: message.body },
    });
  },
};

const socialAdapter: InboxChannelAdapter = {
  channel: "social",
  external: true,
  requiredScopes: ["pages_manage_posts"],
  isConnected: () => envPresent("META_APP_SECRET"),
  async send(message) {
    if (!socialAdapter.isConnected()) throw new ChannelNotConnectedError("social");
    const account = await accountToken(message.accountId, "facebook");
    return graphSend(`${account.externalId}/feed`, account.token, { message: message.body });
  },
};

const linkedinAdapter: InboxChannelAdapter = {
  channel: "linkedin",
  external: true,
  requiredScopes: ["w_member_social"],
  isConnected: () => envPresent("META_APP_SECRET", "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"),
  async send(message) {
    if (!linkedinAdapter.isConnected()) throw new ChannelNotConnectedError("linkedin");
    const account = await accountToken(message.accountId, "linkedin");
    const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: account.externalId,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: message.body },
            shareMediaCategory: "NONE",
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { actuallySent: false, status: "failed", error: `LinkedIn API rejected the post (HTTP ${response.status}).` };
    const data = (await response.json()) as { id?: string };
    return data.id
      ? { actuallySent: true, status: "sent", providerMessageId: data.id }
      : { actuallySent: false, status: "failed", error: "LinkedIn API did not confirm a post ID." };
  },
};

export const INBOX_ADAPTERS: Record<InboxChannel, InboxChannelAdapter> = {
  email: emailAdapter,
  whatsapp: whatsappAdapter,
  messenger: messengerAdapter,
  instagram: instagramAdapter,
  linkedin: linkedinAdapter,
  social: socialAdapter,
  website_chat: websiteChatAdapter,
};

export function getInboxAdapter(channel: string): InboxChannelAdapter | null {
  return INBOX_ADAPTERS[channel as InboxChannel] ?? null;
}

/** Calendar providers are distinct from messaging: no fake events are created. */
export interface CalendarAdapter {
  provider: string;
  requiredScopes: readonly string[];
  isConnected(): boolean;
  createEvent(payload: {
    accountId: string;
    title: string;
    startsAt: string;
    endsAt: string;
    attendees?: string[];
  }): Promise<AdapterSendResult>;
}

export function getCalendarAdapter(provider: string): CalendarAdapter {
  const isGoogle = provider === "google";
  return {
    provider,
    requiredScopes: isGoogle ? ["https://www.googleapis.com/auth/calendar.events"] : [],
    isConnected: () => isGoogle && envPresent("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
    async createEvent(payload) {
      if (!isGoogle || !envPresent("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")) {
        throw new Error("Calendar provider is not connected.");
      }
      const account = await accountToken(payload.accountId, "google");
      const response = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${account.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: payload.title,
            start: { dateTime: payload.startsAt },
            end: { dateTime: payload.endsAt },
            ...(payload.attendees?.length ? { attendees: payload.attendees.map((email) => ({ email })) } : {}),
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (!response.ok) return { actuallySent: false, status: "failed", error: `Google Calendar rejected the event (HTTP ${response.status}).` };
      const data = (await response.json()) as { id?: string };
      return data.id
        ? { actuallySent: true, status: "sent", providerMessageId: data.id }
        : { actuallySent: false, status: "failed", error: "Google Calendar did not confirm an event ID." };
    },
  };
}

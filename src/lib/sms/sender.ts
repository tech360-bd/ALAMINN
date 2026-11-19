/**
 * High-level SMS sender with consent guard + audit trail.
 * ========================================================
 * Wraps src/lib/sms/router.sendSms and:
 *   1. Validates the recipient has given communications consent (latest Inquiry.commsConsent)
 *   2. Writes an audit log entry (sms_send)
 *   3. Returns a normalized result the API route can render
 *
 * SECURITY: Server-only. Never import from a client component.
 */

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/admin-api-server";
import type { Session } from "@/lib/auth";
import { sendSms, type SmsSendResult } from "./router";

export interface SendSmsOptions {
  /** Recipient phone number, international format preferred (e.g. "+8801716609554") */
  to: string;
  /** Message body */
  text: string;
  /** Optional contact id for consent lookup + audit association */
  contactId?: string;
  /** Session used for audit attribution */
  session: Session;
  /** Force a specific provider ("auto" = failover loop order) */
  preferredProvider?: string;
}

/**
 * Send a consent-based SMS through the provider failover loop.
 * Returns { ok, status, providerUsed, actuallySent, messageId, error, fallbackTrail }.
 */
export async function sendConsentSms(
  options: SendSmsOptions
): Promise<{
  ok: boolean;
  status: string;
  providerUsed: string;
  providerName: string;
  messageId: string | null;
  error: string | null;
  actuallySent: boolean;
  fallbackTrail: SmsSendResult["fallbackTrail"];
  consentChecked: boolean;
}> {
  const { to, text, contactId, session, preferredProvider } = options;

  // ─── Consent guard ─────────────────────────────────────────────────
  let consentChecked = false;
  if (contactId) {
    const contact = await db.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        inquiries: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { commsConsent: true } },
        status: true,
      },
    });
    if (!contact) {
      return {
        ok: false,
        status: "FAILED",
        providerUsed: "dev-null",
        providerName: "Dev Mode (no provider)",
        messageId: null,
        error: "Contact not found.",
        actuallySent: false,
        fallbackTrail: [],
        consentChecked: true,
      };
    }
    consentChecked = true;
    if (contact.status !== "active") {
      return {
        ok: false,
        status: "FAILED",
        providerUsed: "dev-null",
        providerName: "Dev Mode (no provider)",
        messageId: null,
        error: `Contact status is "${contact.status}" — not active.`,
        actuallySent: false,
        fallbackTrail: [],
        consentChecked: true,
      };
    }
    if (!contact.inquiries[0]?.commsConsent) {
      return {
        ok: false,
        status: "FAILED",
        providerUsed: "dev-null",
        providerName: "Dev Mode (no provider)",
        messageId: null,
        error: "Contact has not given communications consent. SMS not sent.",
        actuallySent: false,
        fallbackTrail: [],
        consentChecked: true,
      };
    }
    // Prefer the contact's own phone if no explicit `to` was given
    const target = contact.phone;
    if (!target || (to && to.replace(/[\s()-]/g, "") !== target.replace(/[\s()-]/g, ""))) {
      return {
        ok: false,
        status: "FAILED",
        providerUsed: "dev-null",
        providerName: "Dev Mode (no provider)",
        messageId: null,
        error: "Recipient must match the consenting contact’s phone.",
        actuallySent: false,
        fallbackTrail: [],
        consentChecked: true,
      };
    }
    const result = await sendSms(target, text, {
      preferredProvider: (preferredProvider || "auto") as any,
    });
    await writeAudit(
      session,
      "sms_send",
      "SMS",
      result.messageId || undefined,
      {
        toSuffix: target.slice(-4),
        contactId,
        provider: result.providerUsed,
        actuallySent: result.actuallySent,
        status: result.status,
        fallbackTrail: result.fallbackTrail,
        error: result.error,
      }
    );
    return {
      ok: result.status !== "FAILED",
      status: result.status,
      providerUsed: result.providerUsed,
      providerName: result.providerName,
      messageId: result.messageId,
      error: result.error,
      actuallySent: result.actuallySent,
      fallbackTrail: result.fallbackTrail,
      consentChecked: true,
    };
  }

  // No contact context — send directly (still validated by the router)
  const result = await sendSms(to, text, {
    preferredProvider: (preferredProvider || "auto") as any,
  });
  await writeAudit(
    session,
    "sms_send",
    "SMS",
    result.messageId || undefined,
    {
      toSuffix: to.slice(-4),
      provider: result.providerUsed,
      actuallySent: result.actuallySent,
      status: result.status,
      fallbackTrail: result.fallbackTrail,
      error: result.error,
    }
  );
  return {
    ok: result.status !== "FAILED",
    status: result.status,
    providerUsed: result.providerUsed,
    providerName: result.providerName,
    messageId: result.messageId,
    error: result.error,
    actuallySent: result.actuallySent,
    fallbackTrail: result.fallbackTrail,
    consentChecked: false,
  };
}

export { sendSms };
export type { SmsSendResult };

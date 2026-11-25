/**
 * High-level email sender with consent guard + audit trail.
 * =========================================================
 * Wraps src/lib/email/router.sendEmail and:
 *   1. Validates the recipient has given marketing consent (latest Inquiry.marketingConsent)
 *   2. Writes an audit log entry (email_send)
 *   3. Returns a normalized result the API route can render
 *
 * SECURITY: Server-only. Never import from a client component.
 */

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/admin-api-server";
import { sendEmail, type EmailSendResult, type EmailProviderId } from "./router";
import type { Session } from "@/lib/auth";

export interface SendEmailOptions {
  /** Recipient email address */
  to: string;
  /** Email subject */
  subject: string;
  /** HTML body */
  html: string;
  /** Plain-text body */
  text: string;
  /** From address override */
  from?: string;
  /** Optional contact id for consent lookup + audit association */
  contactId?: string;
  /** Session used for audit attribution */
  session: Session;
  /** Force a specific provider ("auto" = failover loop order) */
  preferredProvider?: string;
}

/**
 * Send a consent-based email through the provider failover loop.
 */
export async function sendConsentEmail(
  options: SendEmailOptions
): Promise<{
  ok: boolean;
  status: string;
  providerUsed: string;
  providerName: string;
  messageId: string | null;
  error: string | null;
  actuallySent: boolean;
  fallbackTrail: EmailSendResult["fallbackTrail"];
  consentChecked: boolean;
}> {
  const { to, subject, html, text, from, contactId, session, preferredProvider } = options;

  // ─── Consent guard ─────────────────────────────────────────────────
  if (contactId) {
    const contact = await db.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        fullName: true,
        email: true,
        inquiries: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { marketingConsent: true } },
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
    if (!contact.inquiries[0]?.marketingConsent) {
      return {
        ok: false,
        status: "FAILED",
        providerUsed: "dev-null",
        providerName: "Dev Mode (no provider)",
        messageId: null,
        error: "Contact has not given marketing consent. Email not sent.",
        actuallySent: false,
        fallbackTrail: [],
        consentChecked: true,
      };
    }
    // Prefer the contact's own email if no explicit `to` was given
    const target = contact.email;
    if (!target || (to && to.trim().toLowerCase() !== target.toLowerCase())) {
      return {
        ok: false,
        status: "FAILED",
        providerUsed: "dev-null",
        providerName: "Dev Mode (no provider)",
        messageId: null,
        error: "Recipient must match the consenting contact’s email.",
        actuallySent: false,
        fallbackTrail: [],
        consentChecked: true,
      };
    }
    const result = await sendEmail(target, { subject, html, text, from }, {
      preferredProvider: (preferredProvider || "auto") as EmailProviderId | "auto",
    });
    await writeAudit(
      session,
      "email_send",
      "Email",
      result.messageId || undefined,
      {
        toSuffix: target.split("@")[1] || target,
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
  const result = await sendEmail(to, { subject, html, text, from }, {
    preferredProvider: (preferredProvider || "auto") as EmailProviderId | "auto",
  });
  await writeAudit(
    session,
    "email_send",
    "Email",
    result.messageId || undefined,
    {
      toSuffix: to.split("@")[1] || to,
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

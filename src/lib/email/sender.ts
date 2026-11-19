/**
 * High-level email sender with consent guard + audit trail.
 * =========================================================
 * Wraps src/lib/email/router.sendEmail and:
 *   1. Validates the recipient has given marketing consent (Contact.marketingConsent)
 *   2. Writes an audit log entry (email_send)
 *   3. Returns a normalized result the API route can render
 *
 * SECURITY: Server-only. Never import from a client component.
 */

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/admin-api-server";
import { sendEmail, type EmailSendResult } from "./router";
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
  let consentChecked = false;
  if (contactId) {
    const contact = await db.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        fullName: true,
        email: true,
        marketingConsent: true,
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
    if (!contact.marketingConsent) {
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
    const target = to || contact.email || "";
    if (!target) {
      return {
        ok: false,
        status: "FAILED",
        providerUsed: "dev-null",
        providerName: "Dev Mode (no provider)",
        messageId: null,
        error: "No email address on the contact record.",
        actuallySent: false,
        fallbackTrail: [],
        consentChecked: true,
      };
    }
    const result = await sendEmail(target, { subject, html, text, from }, {
      preferredProvider: (preferredProvider || "auto") as any,
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
    preferredProvider: (preferredProvider || "auto") as any,
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


// ─── Transactional email (compatibility shim for existing auth routes) ─────
/**
 * Template definitions for transactional emails. Each template maps to a
 * subject line and body renderer. Called by auth / approval / inquiry routes
 * that previously imported `sendTransactional` from `@/lib/email`.
 */
type TemplateVars = Record<string, string | number | boolean>;

interface TemplateDef {
  subject: string;
  text: (vars: TemplateVars) => string;
  html: (vars: TemplateVars) => string;
}

const TRANSACTIONAL_TEMPLATES: Record<string, TemplateDef> = {
  passwordReset: {
    subject: "Password Reset — Alaminn.info",
    text: (v) => `Hi ${v.name},

You requested a password reset. Click the link below to set a new password:

${v.resetUrl}

This link expires in ${v.expiresIn}.

If you didn't request this, you can safely ignore this email.
`,
    html: (v) => `<p>Hi ${String(v.name)},</p><p>You requested a password reset. Click the button below to set a new password:</p><p><a href="${String(v.resetUrl)}" style="background:#0f172a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Reset password</a></p><p>This link expires in ${String(v.expiresIn)}.</p><p>If you didn't request this, you can safely ignore this email.</p>`,
  },
  aiTaskCompleted: {
    subject: "AI Task Completed — Alaminn.info",
    text: (v) => `Hi,

Your AI task "${String(v.workflow)}" has been completed.

Objective: ${String(v.objective)}

Review it here: ${String(v.reviewUrl)}
`,
    html: (v) => `<p>Hi,</p><p>Your AI task "<strong>${String(v.workflow)}</strong>" has been completed.</p><p><strong>Objective:</strong> ${String(v.objective)}</p><p><a href="${String(v.reviewUrl)}">Review task</a></p>`,
  },
};

/** Render a template with variables, falling back gracefully. */
function renderTemplate(
  name: string,
  vars: TemplateVars
): { subject: string; text: string; html: string } | null {
  const tpl = TRANSACTIONAL_TEMPLATES[name];
  if (!tpl) return null;
  return {
    subject: tpl.subject,
    text: tpl.text(vars),
    html: tpl.html(vars),
  };
}

/**
 * Send a transactional email using a named template.
 * Compatibility shim for existing routes that import `sendTransactional`.
 * Never throws — failures are caught and returned as a rejected promise
 * that callers can `.catch(() => null)`.
 */
export async function sendTransactional(
  templateName: string,
  vars: Record<string, unknown>,
  options: { to: string; ipHash?: string; triggeredBy?: string }
): Promise<{ ok: boolean; providerUsed: string; actuallySent: boolean }> {
  const rendered = renderTemplate(templateName, vars as TemplateVars);
  if (!rendered) {
    return {
      ok: false,
      providerUsed: "dev-null",
      actuallySent: false,
    };
  }

  const { to, ipHash, triggeredBy } = options;

  try {
    const result = await sendEmail(to, {
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    // Best-effort audit
    try {
      await writeAudit(
        undefined as any,
        "email_send_transactional",
        "Email",
        result.messageId || undefined,
        {
          toSuffix: to.split("@")[1] || to,
          template: templateName,
          provider: result.providerUsed,
          actuallySent: result.actuallySent,
          status: result.status,
          ipHash,
          triggeredBy,
        }
      );
    } catch {
      // Audit failure must not break the send
    }

    return {
      ok: result.status !== "FAILED",
      providerUsed: result.providerUsed,
      actuallySent: result.actuallySent,
    };
  } catch {
    return {
      ok: false,
      providerUsed: "dev-null",
      actuallySent: false,
    };
  }
}

export { sendEmail };
export type { EmailSendResult };

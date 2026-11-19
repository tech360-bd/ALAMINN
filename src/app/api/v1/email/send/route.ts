/**
 * POST /api/v1/email/send
 * ========================
 * Admin-only endpoint for sending consent-based email through the free
 * provider failover loop (SparkPost → Mailgun → SendGrid → Mailjet →
 * SendinBlue → SendPulse → Pepipost → ElasticEmail → Resend → SMTP → dev mode).
 *
 * If one provider hits its free limit (429 / failure), the router
 * automatically falls over to the next provider — exactly like the SMS
 * and AI free-routers.
 *
 * Body: { to?: string, subject?: string, html?: string, text?: string,
 *         from?: string, contactId?: string }
 *
 * Requires `email.send` permission.
 */
import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson } from "@/lib/admin-api-server";
import { sendConsentEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "email.send");
  if (guard.denied) return guard.response;

  const body = await readJson<{
    to?: string;
    subject?: string;
    html?: string;
    text?: string;
    from?: string;
    contactId?: string;
  }>(req);
  if (!body) return fail("Invalid JSON body.", ["invalid_json"], 400);

  const to = typeof body.to === "string" ? body.to.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const html = typeof body.html === "string" ? body.html : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const from = typeof body.from === "string" ? body.from.trim() : undefined;
  const contactId =
    typeof body.contactId === "string" ? body.contactId.trim() : undefined;

  if (!to) return fail("`to` is required.", ["to_required"], 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return fail("`to` must be a valid email address.", ["invalid_to"], 400);
  }
  if (!subject) return fail("`subject` is required.", ["subject_required"], 400);
  if (!text) return fail("`text` is required.", ["text_required"], 400);

  const result = await sendConsentEmail({
    to,
    subject,
    html,
    text,
    from,
    contactId,
    session: guard.session,
  });

  if (!result.ok) {
    return fail(
      result.error || "Email could not be sent.",
      ["send_failed"],
      result.actuallySent ? 202 : 502,
      {
        status: result.status,
        providerUsed: result.providerUsed,
        actuallySent: result.actuallySent,
        fallbackTrail: result.fallbackTrail,
      }
    );
  }

  return ok(
    {
      status: result.status,
      providerUsed: result.providerUsed,
      providerName: result.providerName,
      messageId: result.messageId,
      actuallySent: result.actuallySent,
      consentChecked: result.consentChecked,
      fallbackTrail: result.fallbackTrail,
    },
    result.actuallySent
      ? "Email sent."
      : "Email queued (dev mode — not actually sent. Configure an email provider key to enable real sends.)",
    { toSuffix: to.split("@")[1] || to }
  );
}

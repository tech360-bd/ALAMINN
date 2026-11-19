/**
 * POST /api/v1/sms/send
 * ======================
 * Admin-only endpoint for sending consent-based SMS through the free
 * provider failover loop (httpSMS → Textbelt → Twilio → Plivo → dev mode).
 *
 * If the first provider hits its free-tier limit (429 / failure), the
 * router automatically falls over to the next provider — exactly like the
 * AI free-router. Dev mode (no provider configured) logs instead of sending.
 *
 * Body: { to?: string, text?: string, contactId?: string }
 *   - `to`: recipient phone number, international format preferred
 *     (e.g. "+8801716609554"). Required unless `contactId` is given.
 *   - `text`: message body (max 1600 chars)
 *   - `contactId`: optional Contact id — enforces commsConsent + active status
 *
 * Requires `sms.send` permission.
 */
import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson } from "@/lib/admin-api-server";
import { sendConsentSms } from "@/lib/sms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "sms.send");
  if (guard.denied) return guard.response;

  const body = await readJson<{ to?: string; text?: string; contactId?: string }>(req);
  if (!body) return fail("Invalid JSON body.", ["invalid_json"], 400);

  const to = typeof body.to === "string" ? body.to.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const contactId =
    typeof body.contactId === "string" ? body.contactId.trim() : undefined;

  if (!to && !contactId) {
    return fail("`to` or `contactId` is required.", ["to_or_contact_required"], 400);
  }
  if (to && !/^\+?\d[\d\s\-()]{7,}$/.test(to)) {
    return fail("`to` must be a valid phone number.", ["invalid_to"], 400);
  }
  if (!text) return fail("`text` is required.", ["text_required"], 400);
  if (text.length > 1600) return fail("Text too long (max 1600 chars).", ["text_too_long"], 400);

  const result = await sendConsentSms({
    to,
    text,
    contactId,
    session: guard.session,
  });

  if (!result.ok) {
    return fail(
      result.error || "SMS could not be sent.",
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
      ? "SMS sent."
      : "SMS queued (dev mode — not actually sent. Configure SMS_HTTPSMS_API_KEY or SMS_TEXTBELT_KEY to enable real sends.)",
    { toSuffix: to.slice(-4) || "contact" }
  );
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyEcosystemRequest, logEcosystemUsage } from "@/lib/ecosystem/gateway";
import { findDuplicateContacts, recomputeContactScore } from "@/lib/crm/lead-hygiene";
import { fireAutomationEvent, contactEventFields } from "@/lib/automation/engine";
import { emitWebhookEvent } from "@/lib/api-platform/webhooks";
import type { ApiKeyScope } from "@/lib/api-platform/keys";

export const dynamic = "force-dynamic";

const leadSchema = z.object({
  fullName: z.string().trim().min(1).max(500),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(500).optional(),
  whatsapp: z.string().trim().max(500).optional(),
  organization: z.string().trim().max(500).optional(),
  role: z.string().trim().max(191).optional(),
  country: z.string().trim().max(500).optional(),
  city: z.string().trim().max(500).optional(),
  tags: z.string().trim().max(500).optional(),
  source: z.string().trim().max(120).default("ecosystem-api"),
  dedupe: z.enum(["skip", "update", "force"]).default("skip"),
});

const listSchema = z.object({
  email: z.string().trim().email().max(254).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});

/**
 * GET /api/v1/ecosystem/leads — read leads (scope: leads:read).
 * Supports exact email lookup (?email=) and name/organization search (?q=).
 */
export async function GET(req: NextRequest) {
  const started = Date.now();
  const guard = await verifyEcosystemRequest(req, "", { scope: "leads:read" as ApiKeyScope, route: "/api/v1/ecosystem/leads" });
  if (!guard.allowed) return guard.response;

  const url = new URL(req.url);
  const parsed = listSchema.safeParse({
    email: url.searchParams.get("email") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    await logEcosystemUsage(guard.credential ?? null, "/api/v1/ecosystem/leads", "GET", 400, Date.now() - started);
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message || "Invalid query.", error: "invalid_query", data: null, meta: {}, errors: ["invalid_query"] },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }
  const { email, q, page, pageSize } = parsed.data;
  const where = {
    ...(email ? { email } : {}),
    ...(q ? { OR: [{ fullName: { contains: q } }, { organization: { contains: q } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.contact.findMany({
      where,
      select: { id: true, fullName: true, email: true, phone: true, organization: true, country: true, status: true, leadScore: true, leadScoreGrade: true, tags: true, source: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.contact.count({ where }),
  ]);
  await logEcosystemUsage(guard.credential ?? null, "/api/v1/ecosystem/leads", "GET", 200, Date.now() - started);
  return NextResponse.json(
    { success: true, message: "Leads loaded.", data: items, meta: { page, pageSize, total }, errors: [] },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}

/**
 * POST /api/v1/ecosystem/leads — create/update a lead (scope: leads:write).
 * Dedupes against existing contacts (same matcher as the admin UI):
 *  - default: an existing email or phone match → 409 with the matches (no silent duplicates)
 *  - dedupe=update: refresh the existing contact with provided fields (by email)
 *  - dedupe=force: create a brand-new contact even on a phone match
 *    (emails remain unique by schema — a duplicate email still fails)
 * Fires contact.created automation + webhooks and scores the lead.
 */
export async function POST(req: NextRequest) {
  const started = Date.now();
  const rawBody = await req.text();
  const guard = await verifyEcosystemRequest(req, rawBody, { scope: "leads:write" as ApiKeyScope, route: "/api/v1/ecosystem/leads" });
  if (!guard.allowed) return guard.response;

  const fail = (message: string, status: number, extra: Record<string, unknown> = {}) => {
    return (async () => {
      await logEcosystemUsage(guard.credential ?? null, "/api/v1/ecosystem/leads", "POST", status, Date.now() - started);
      return NextResponse.json(
        { success: false, message, error: message, data: null, meta: extra, errors: [status === 401 ? "unauthenticated" : "request_rejected"] },
        { status, headers: { "cache-control": "no-store" } }
      );
    })();
  };

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return fail("Request body is not valid JSON.", 400);
  }
  const parsed = leadSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid lead payload.", 400);

  const lead = parsed.data;
  try {
    if (lead.dedupe !== "force") {
      const duplicates = await findDuplicateContacts(db, { email: lead.email, phone: lead.phone });
      const emailMatch = duplicates.find((d) => d.matchOn.includes("email"));
      if (duplicates.length && !(lead.dedupe === "update" && emailMatch)) {
        return fail(
          "A matching contact already exists. Pass dedupe=update to refresh it by email, or dedupe=force to create a new record anyway.",
          409,
          { matches: duplicates.map((d) => ({ id: d.id, email: d.email, matchOn: d.matchOn })) }
        );
      }
      if (lead.dedupe === "update" && emailMatch) {
        const updated = await db.contact.update({
          where: { id: emailMatch.id },
          data: {
            fullName: lead.fullName,
            ...(lead.phone ? { phone: lead.phone } : {}),
            ...(lead.whatsapp ? { whatsapp: lead.whatsapp } : {}),
            ...(lead.organization ? { organization: lead.organization } : {}),
            ...(lead.role ? { role: lead.role } : {}),
            ...(lead.country ? { country: lead.country } : {}),
            ...(lead.city ? { city: lead.city } : {}),
            ...(lead.tags ? { tags: lead.tags } : {}),
            updatedAt: new Date(),
          },
        });
        await recomputeContactScore(db, updated.id).catch(() => undefined);
        await fireAutomationEvent({
          trigger: "contact.updated",
          contactId: updated.id,
          fields: contactEventFields(updated as never),
        }).catch(() => undefined);
        await logEcosystemUsage(guard.credential ?? null, "/api/v1/ecosystem/leads", "POST", 200, Date.now() - started);
        return NextResponse.json(
          { success: true, message: "Existing lead updated (dedupe=update).", data: { id: updated.id, dedupe: "update" }, meta: {}, errors: [] },
          { status: 200, headers: { "cache-control": "no-store" } }
        );
      }
    }

    const { dedupe: _dedupe, ...leadData } = lead;
    const created = await db.contact.create({
      data: {
        fullName: leadData.fullName,
        email: leadData.email,
        phone: leadData.phone ?? null,
        whatsapp: leadData.whatsapp ?? null,
        organization: leadData.organization ?? null,
        role: leadData.role ?? null,
        country: leadData.country ?? null,
        city: leadData.city ?? null,
        tags: leadData.tags ?? null,
        source: leadData.source,
      },
    });
    await recomputeContactScore(db, created.id).catch(() => undefined);
    const scored = await db.contact.findUnique({ where: { id: created.id } });
    await fireAutomationEvent({
      trigger: "contact.created",
      contactId: created.id,
      fields: contactEventFields(scored ?? created),
    }).catch(() => undefined);
    await emitWebhookEvent("contact.created", {
      contactId: created.id,
      email: created.email,
      fullName: created.fullName,
      source: lead.source,
    }).catch(() => undefined);
    await logEcosystemUsage(guard.credential ?? null, "/api/v1/ecosystem/leads", "POST", 201, Date.now() - started);
    return NextResponse.json(
      {
        success: true,
        message: "Lead created, scored and routed to automation.",
        data: {
          id: created.id,
          leadScore: scored?.leadScore ?? null,
          leadScoreGrade: scored?.leadScoreGrade ?? null,
        },
        meta: {},
        errors: [],
      },
      { status: 201, headers: { "cache-control": "no-store" } }
    );
  } catch (e) {
    return fail(`Lead write failed: ${(e as Error).message}`.slice(0, 200), 500);
  }
}

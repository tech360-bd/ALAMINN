import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyEcosystemRequest, logEcosystemUsage } from "@/lib/ecosystem/gateway";
import { emitWebhookEvent } from "@/lib/api-platform/webhooks";
import type { ApiKeyScope } from "@/lib/api-platform/keys";

export const dynamic = "force-dynamic";

const REFERRAL_TYPES = [
  "course-application", "university-application", "scholarship-application", "phd-application",
  "research-application", "supervisor-enquiry", "eligibility-check", "consultation",
  "resource-referral", "deadline-alert", "english-referral",
] as const;

const applicationSchema = z.object({
  referralType: z.enum(REFERRAL_TYPES),
  targetUrl: z.string().url().startsWith("https://").max(2000),
  countrySlug: z.string().trim().max(120).optional(),
  universitySlug: z.string().trim().max(120).optional(),
  courseSlug: z.string().trim().max(120).optional(),
  scholarshipSlug: z.string().trim().max(120).optional(),
  studyLevel: z.string().trim().max(120).optional(),
  intake: z.string().trim().max(120).optional(),
  campaignCode: z.string().trim().max(120).optional(),
  studentName: z.string().trim().max(300).optional(),
  studentEmail: z.string().trim().email().max(254).optional(),
  consentGiven: z.boolean().default(false),
});

const listSchema = z.object({
  status: z.enum(["created", "transferred", "completed", "failed", "expired"]).optional(),
  referralType: z.enum(REFERRAL_TYPES).optional(),
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});

/** GET /api/v1/ecosystem/applications — read Higher Study applications (scope: applications:read) */
export async function GET(req: NextRequest) {
  const started = Date.now();
  const guard = await verifyEcosystemRequest(req, "", { scope: "applications:read" as ApiKeyScope, route: "/api/v1/ecosystem/applications" });
  if (!guard.allowed) return guard.response;

  const url = new URL(req.url);
  const parsed = listSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    referralType: url.searchParams.get("referralType") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    await logEcosystemUsage(guard.credential ?? null, "/api/v1/ecosystem/applications", "GET", 400, Date.now() - started);
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message || "Invalid query.", error: "invalid_query", data: null, meta: {}, errors: ["invalid_query"] },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }
  const { status, referralType, page, pageSize } = parsed.data;
  const where = { ...(status ? { status } : {}), ...(referralType ? { referralType } : {}) };
  const [items, total] = await Promise.all([
    db.higherStudyReferral.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.higherStudyReferral.count({ where }),
  ]);
  await logEcosystemUsage(guard.credential ?? null, "/api/v1/ecosystem/applications", "GET", 200, Date.now() - started);
  return NextResponse.json(
    { success: true, message: "Applications loaded.", data: items, meta: { page, pageSize, total }, errors: [] },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}

/**
 * POST /api/v1/ecosystem/applications — create a Higher Study application
 * (scope: applications:write). Links an ALO Education referral record
 * (24h expiry handled by the public flow) and emits a webhook.
 */
export async function POST(req: NextRequest) {
  const started = Date.now();
  const rawBody = await req.text();
  const guard = await verifyEcosystemRequest(req, rawBody, { scope: "applications:write" as ApiKeyScope, route: "/api/v1/ecosystem/applications" });
  if (!guard.allowed) return guard.response;

  const fail = async (message: string, status: number): Promise<NextResponse> => {
    await logEcosystemUsage(guard.credential ?? null, "/api/v1/ecosystem/applications", "POST", status, Date.now() - started);
    return NextResponse.json(
      { success: false, message, error: message, data: null, meta: {}, errors: ["request_rejected"] },
      { status, headers: { "cache-control": "no-store" } }
    );
  };

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return await fail("Request body is not valid JSON.", 400);
  }
  const parsed = applicationSchema.safeParse(payload);
  if (!parsed.success) return await fail(parsed.error.issues[0]?.message || "Invalid application payload.", 400);

  const input = parsed.data;
  try {
    // Optionally link the application to a CRM contact by email.
    let contactId: string | null = null;
    if (input.studentEmail) {
      const contact = await db.contact.findUnique({ where: { email: input.studentEmail } });
      if (contact) contactId = contact.id;
    }
    const created = await db.higherStudyReferral.create({
      data: {
        referralCode: `eco_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
        source: "ECOSYSTEM_API",
        referralType: input.referralType,
        targetUrl: input.targetUrl,
        countrySlug: input.countrySlug ?? null,
        universitySlug: input.universitySlug ?? null,
        courseSlug: input.courseSlug ?? null,
        scholarshipSlug: input.scholarshipSlug ?? null,
        studyLevel: input.studyLevel ?? null,
        intake: input.intake ?? null,
        campaignCode: input.campaignCode ?? null,
        consentGiven: input.consentGiven,
        consentTimestamp: input.consentGiven ? new Date() : null,
        status: "created",
        expiresAt: new Date(Date.now() + 24 * 3600_000),
      },
    });
    if (contactId) {
      await db.note
        .create({
          data: {
            body: `Ecosystem application ${created.referralType} (${created.referralCode}) → ${created.targetUrl}`.slice(0, 2000),
            contactId,
          },
        })
        .catch(() => undefined);
    }
    await emitWebhookEvent("application.created", {
      referralId: created.id,
      referralCode: created.referralCode,
      referralType: created.referralType,
      contactId,
    }).catch(() => undefined);
    await logEcosystemUsage(guard.credential ?? null, "/api/v1/ecosystem/applications", "POST", 201, Date.now() - started);
    return NextResponse.json(
      { success: true, message: "Application created.", data: { id: created.id, referralCode: created.referralCode, expiresAt: created.expiresAt }, meta: {}, errors: [] },
      { status: 201, headers: { "cache-control": "no-store" } }
    );
  } catch (e) {
    return await fail(`Application write failed: ${(e as Error).message}`.slice(0, 200), 500);
  }
}

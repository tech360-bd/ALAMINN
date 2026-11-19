import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

const ACTIONS = ["VERIFY", "CORRECT", "RETIRE", "APPROVE", "FLAG_CONFLICT", "HUMAN_REVIEW", "NOTE"] as const;
type Action = (typeof ACTIONS)[number];

const TARGET_STATUS: Record<Action, string | null> = {
  VERIFY: "OFFICIAL_SOURCE_VERIFIED",
  CORRECT: "SOURCE_CHECK_REQUIRED", // corrected values re-enter verification
  RETIRE: "UNAVAILABLE",
  APPROVE: "APPROVED_FOR_PUBLICATION",
  FLAG_CONFLICT: "CONFLICTING_INFORMATION",
  HUMAN_REVIEW: "HUMAN_REVIEW_REQUIRED",
  NOTE: null,
};

/**
 * POST /api/uci/admin/action — human verification decision on a record.
 * RBAC: uci.verify (ADMIN, EDITOR).
 * Body: { recordId, action, expectedVersion?, note?, fieldPatch? }
 * Rules enforced server-side:
 *  - The acting identity comes from the session cookie, never from the request
 *    body (clients cannot forge the reviewer name).
 *  - APPROVE requires the record to already be OFFICIAL_SOURCE_VERIFIED.
 *  - fieldPatch never overwrites raw fields silently: the patch is stored on
 *    the event and applied to fieldsJson with an audit trail.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!can(session.role, "uci.verify")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = z.object({
    recordId: z.string().min(1).max(191),
    action: z.enum(ACTIONS),
    note: z.string().max(4000).optional(),
    expectedVersion: z.number().int().nonnegative().optional(),
    fieldPatch: z.record(z.string().min(1).max(191), z.string().max(16_000)).optional(),
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid review decision" }, { status: 400 });
  const body = parsed.data;
  const patch = body.fieldPatch && Object.keys(body.fieldPatch).length ? body.fieldPatch : null;
  if (patch && body.action !== "CORRECT") {
    return NextResponse.json({ error: "Only a correction may change verified fields" }, { status: 422 });
  }
  if (["APPROVE", "VERIFY", "CORRECT"].includes(body.action) && body.expectedVersion === undefined) {
    return NextResponse.json({ error: "Review the current record version before submitting this decision" }, { status: 422 });
  }

  const record = await db.uciRequirementRecord.findUnique({ where: { id: body.recordId } });
  if (!record) return NextResponse.json({ error: "record not found" }, { status: 404 });

  if (body.expectedVersion !== undefined && body.expectedVersion !== record.version) {
    return NextResponse.json({ error: "Record changed since you opened it. Reload and review it again." }, { status: 409 });
  }

  if (body.action === "APPROVE" && record.verificationStatus !== "OFFICIAL_SOURCE_VERIFIED") {
    return NextResponse.json(
      { error: "Only records already OFFICIAL_SOURCE_VERIFIED can be approved for publication." },
      { status: 422 },
    );
  }
  if (body.action === "APPROVE" && record.lastVerifiedAt === null) {
    return NextResponse.json(
      { error: "Approval requires a recorded verification first." },
      { status: 422 },
    );
  }

  const targetStatus = TARGET_STATUS[body.action];
  const fieldsJson = patch ? JSON.stringify({ ...JSON.parse(record.fieldsJson || "{}"), ...patch }) : undefined;
  const updated = await db.$transaction(async (tx) => {
    const change = await tx.uciRequirementRecord.updateMany({
      where: { id: record.id, version: record.version },
      data: {
        version: { increment: 1 },
        fieldsJson,
        verificationStatus: targetStatus ?? record.verificationStatus,
        lastVerifiedAt: body.action === "VERIFY" ? new Date() : body.action === "CORRECT" ? null : record.lastVerifiedAt,
        reviewedBy: session.email,
        retiredReason: body.action === "RETIRE" ? body.note ?? null : record.retiredReason,
      },
    });
    if (change.count !== 1) return null;
    const event = await tx.uciVerificationEvent.create({
      data: {
        recordId: record.id,
        action: body.action,
        fromStatus: record.verificationStatus,
        toStatus: targetStatus ?? record.verificationStatus,
        actor: session.email,
        note: body.note ?? null,
        fieldPatch: patch ? JSON.stringify(patch) : null,
      },
    });
    await tx.uciAuditLog.create({
      data: {
        actor: session.email,
        action: body.action,
        entity: "UciRequirementRecord",
        entityId: record.id,
        detail: JSON.stringify({
          from: record.verificationStatus,
          to: targetStatus ?? record.verificationStatus,
          note: body.note ?? null,
          patch,
          fromVersion: record.version,
          toVersion: record.version + 1,
        }),
      },
    });
    return event;
  });

  if (!updated) return NextResponse.json({ error: "Record changed concurrently. Reload and review it again." }, { status: 409 });
  return NextResponse.json({ ok: true, event: updated });
}

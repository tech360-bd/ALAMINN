import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
 * Body: { recordId, action, note?, fieldPatch? }
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

  const body = (await req.json().catch(() => null)) as
    | { recordId?: string; action?: Action; note?: string; fieldPatch?: Record<string, string> }
    | null;
  if (!body?.recordId || !body?.action || !ACTIONS.includes(body.action)) {
    return NextResponse.json({ error: "recordId and a valid action are required" }, { status: 400 });
  }

  const record = await db.uciRequirementRecord.findUnique({ where: { id: body.recordId } });
  if (!record) return NextResponse.json({ error: "record not found" }, { status: 404 });

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

  const patch = body.fieldPatch && Object.keys(body.fieldPatch).length > 0 ? body.fieldPatch : null;
  const targetStatus = TARGET_STATUS[body.action];

  const updated = await db.$transaction(async (tx) => {
    if (patch) {
      const fields = JSON.parse(record.fieldsJson || "{}") as Record<string, string>;
      const merged = { ...fields, ...patch };
      await tx.uciRequirementRecord.update({
        where: { id: record.id },
        data: {
          fieldsJson: JSON.stringify(merged),
          verificationStatus: targetStatus ?? record.verificationStatus,
          lastVerifiedAt: body.action === "VERIFY" || body.action === "APPROVE" ? new Date() : record.lastVerifiedAt,
          reviewedBy: session.email,
          retiredReason: body.action === "RETIRE" ? body.note ?? null : record.retiredReason,
        },
      });
    } else {
      await tx.uciRequirementRecord.update({
        where: { id: record.id },
        data: {
          verificationStatus: targetStatus ?? record.verificationStatus,
          lastVerifiedAt: body.action === "VERIFY" || body.action === "APPROVE" ? new Date() : record.lastVerifiedAt,
          reviewedBy: session.email,
          retiredReason: body.action === "RETIRE" ? body.note ?? null : record.retiredReason,
        },
      });
    }
    const event = await tx.uciVerificationEvent.create({
      data: {
        recordId: record.id,
        action: body.action!,
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
        action: body.action!,
        entity: "UciRequirementRecord",
        entityId: record.id,
        detail: JSON.stringify({
          from: record.verificationStatus,
          to: targetStatus ?? record.verificationStatus,
          note: body.note ?? null,
          patch: patch ?? null,
        }),
      },
    });
    return event;
  });

  return NextResponse.json({ ok: true, event: updated });
}

/**
 * POST /api/v1/higher-study/referral/[code]/confirm
 * --------------------------------------------------------------------
 * Server-to-server callback endpoint called by ALO Education when the
 * student has been created / started an application on their side.
 *
 * Headers required:
 *   X-Alaminn-Signature: <HMAC-SHA256 base64url signature of `${code}.${rawBody}` or `rawBody`>
 *
 * Body: `{ aloStudentId?, status: 'completed' | 'failed', failureReason? }`
 *
 * Security invariants:
 *   - Fails closed (503) in production if `HIGHER_STUDY_REFERRAL_SECRET`
 *     is not configured (no fallback secret).
 *   - Verifies HMAC-SHA256 over the raw request body using
 *     `verifyReferralCallback()`.
 *   - Rejects browser-facing `referralToken` strings (`<payload>.<sig>`)
 *     so anonymous referral creators cannot confirm their own referrals.
 *   - Enforces valid state transitions and rejects duplicate callbacks
 *     (409) and expired referrals (410).
 */
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  jsonResponse,
  resolveHigherStudyReferralSecret,
  safeString,
  verifyReferralCallback,
} from "@/lib/higher-study/api-helpers";

export const dynamic = "force-dynamic";

interface ConfirmBody {
  aloStudentId?: string;
  status: "completed" | "failed";
  failureReason?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const referralCode = safeString(code);
    if (!referralCode || !/^[A-Z0-9]{6,32}$/.test(referralCode)) {
      return jsonResponse(
        false,
        "Valid referral code required.",
        null,
        {},
        ["code_required"],
        400,
      );
    }

    const secret = resolveHigherStudyReferralSecret();
    if (!secret) {
      return jsonResponse(
        false,
        "Referral callback secret is not configured.",
        null,
        {},
        ["referral_secret_not_configured"],
        503,
      );
    }

    const signatureHeader =
      req.headers.get("x-alaminn-signature") ||
      req.headers.get("x-referral-signature");
    if (!signatureHeader) {
      return jsonResponse(
        false,
        "Missing signature.",
        null,
        {},
        ["signature_missing"],
        401,
      );
    }

    // Read the raw body for HMAC verification before JSON parsing.
    const rawBody = await req.text();
    if (!verifyReferralCallback(referralCode, rawBody, signatureHeader, secret)) {
      return jsonResponse(
        false,
        "Invalid signature.",
        null,
        {},
        ["signature_invalid"],
        401,
      );
    }

    let body: ConfirmBody;
    try {
      body = JSON.parse(rawBody) as ConfirmBody;
    } catch {
      return jsonResponse(
        false,
        "Invalid JSON body.",
        null,
        {},
        ["invalid_body"],
        400,
      );
    }

    if (body.status !== "completed" && body.status !== "failed") {
      return jsonResponse(
        false,
        "status must be 'completed' or 'failed'.",
        null,
        {},
        ["status_invalid"],
        400,
      );
    }

    // Look up the referral.
    const referral = await db.higherStudyReferral.findUnique({
      where: { referralCode },
    });
    if (!referral) {
      return jsonResponse(
        false,
        "Referral not found.",
        null,
        {},
        ["not_found"],
        404,
      );
    }

    // Reject callbacks on referrals that have already reached a terminal state.
    if (
      referral.status === "completed" ||
      referral.status === "failed" ||
      referral.status === "expired"
    ) {
      return jsonResponse(
        false,
        `Referral is already in terminal status '${referral.status}'.`,
        null,
        { currentStatus: referral.status },
        ["referral_already_finalized"],
        409,
      );
    }

    const now = new Date();
    const maxReferralAgeMs = 7 * 24 * 60 * 60 * 1000;
    const isExpired =
      (referral.expiresAt && referral.expiresAt.getTime() < now.getTime()) ||
      now.getTime() - referral.createdAt.getTime() > maxReferralAgeMs;
    if (isExpired) {
      await db.higherStudyReferral
        .update({
          where: { id: referral.id },
          data: { status: "expired" },
        })
        .catch(() => null);
      return jsonResponse(
        false,
        "Referral has expired.",
        null,
        {},
        ["referral_expired"],
        410,
      );
    }

    // Apply the status transition atomically where status is still non-terminal.
    if (body.status === "completed") {
      const updated = await db.higherStudyReferral.updateMany({
        where: {
          id: referral.id,
          status: { in: ["created", "transferred"] },
        },
        data: {
          status: "completed",
          completedAt: now,
          failureReason: null,
        },
      });
      if (updated.count === 0) {
        return jsonResponse(
          false,
          "Referral state changed concurrently.",
          null,
          {},
          ["referral_already_finalized"],
          409,
        );
      }
    } else {
      const updated = await db.higherStudyReferral.updateMany({
        where: {
          id: referral.id,
          status: { in: ["created", "transferred"] },
        },
        data: {
          status: "failed",
          failureReason: safeString(body.failureReason).slice(0, 500) || null,
        },
      });
      if (updated.count === 0) {
        return jsonResponse(
          false,
          "Referral state changed concurrently.",
          null,
          {},
          ["referral_already_finalized"],
          409,
        );
      }
    }

    // Write an audit log entry.
    try {
      await db.higherStudyAuditLog.create({
        data: {
          action: `referral.${body.status}`,
          entityType: "referral",
          entityId: referral.id,
          entitySlug: referralCode,
          beforeData: JSON.stringify({ status: referral.status }),
          afterData: JSON.stringify({
            status: body.status,
            aloStudentId: body.aloStudentId ?? null,
            failureReason: body.failureReason ?? null,
          }),
        },
      });
    } catch {
      // Non-fatal
    }

    return jsonResponse(true, "Referral updated.", {
      referralCode,
      status: body.status,
    });
  } catch (err) {
    console.error("[higher-study/referral/[code]/confirm] error", err);
    return jsonResponse(
      false,
      "Internal server error.",
      null,
      {},
      ["internal"],
      500,
    );
  }
}

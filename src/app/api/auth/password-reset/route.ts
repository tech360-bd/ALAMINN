import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { hashResetCode, newResetCode } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/auth/ratelimit";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ action: z.literal("request"), email: z.string().email().max(200) });
const confirmSchema = z.object({
  action: z.literal("confirm"),
  email: z.string().email().max(200),
  code: z.string().regex(/^\d{6}$/, "6-digit code required"),
  newPassword: z.string().min(10).max(200),
});

/**
 * POST /api/auth/password-reset
 *  action=request → issues a single-use 6-digit OTP (15 min, hashed at rest).
 *  action=confirm → verifies the OTP and sets the new password.
 *
 * Delivery honesty: this deployment has no SMTP/mail provider configured, so
 * when AUTH_EXPOSE_RESET_OTP=true the response returns the OTP directly for
 * that request only (documented in .env.example). When a mail transport is
 * configured later, set it to false and deliver out-of-band. Every request and
 * confirmation is audit-logged.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const body = await req.json().catch(() => null);

  const parsedReq = requestSchema.safeParse(body);
  if (parsedReq.success) {
    const rl = rateLimit({ key: `pwreset:${ip}`, limit: 5, windowMs: 15 * 60_000 });
    if (!rl.ok) return NextResponse.json({ error: `Too many requests. Try again in ${rl.retryAfterSec}s.` }, { status: 429 });

    const email = parsedReq.data.email.trim().toLowerCase();
    const account = await db.staffAccount.findUnique({ where: { email } });
    // Uniform response regardless of existence (no account enumeration).
    const generic = { ok: true, message: "If the account exists, a reset code has been issued (valid 15 minutes)." };
    if (!account || !account.isActive) return NextResponse.json(generic);

    const { code, codeHash } = newResetCode();
    await db.passwordResetCode.deleteMany({ where: { accountId: account.id, usedAt: null } });
    await db.passwordResetCode.create({
      data: { accountId: account.id, codeHash, expiresAt: new Date(Date.now() + 15 * 60_000) },
    });
    await db.uciAuditLog.create({
      data: { actor: email, action: "auth.password_reset_requested", entity: "StaffAccount", entityId: account.id, detail: JSON.stringify({ ip }) },
    });
    const expose = process.env.AUTH_EXPOSE_RESET_OTP === "true";
    return NextResponse.json(expose ? { ...generic, code, delivery: "response (no mail transport configured)" } : generic);
  }

  const parsedConfirm = confirmSchema.safeParse(body);
  if (parsedConfirm.success) {
    const rl = rateLimit({ key: `pwconfirm:${ip}`, limit: 10, windowMs: 15 * 60_000 });
    if (!rl.ok) return NextResponse.json({ error: `Too many attempts. Try again in ${rl.retryAfterSec}s.` }, { status: 429 });

    const email = parsedConfirm.data.email.trim().toLowerCase();
    const account = await db.staffAccount.findUnique({ where: { email } });
    if (!account || !account.isActive) return NextResponse.json({ error: "Invalid code or account" }, { status: 400 });

    const record = await db.passwordResetCode.findFirst({
      where: { accountId: account.id, usedAt: null, codeHash: hashResetCode(parsedConfirm.data.code), expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!record) return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });

    await db.$transaction([
      db.passwordResetCode.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      db.staffAccount.update({ where: { id: account.id }, data: { passwordHash: await hashPassword(parsedConfirm.data.newPassword) } }),
      db.staffSession.deleteMany({ where: { accountId: account.id } }), // revoke all sessions
      db.uciAuditLog.create({
        data: { actor: email, action: "auth.password_reset_confirmed", entity: "StaffAccount", entityId: account.id, detail: JSON.stringify({ ip }) },
      }),
    ]);
    return NextResponse.json({ ok: true, message: "Password updated. All sessions were revoked; please sign in again." });
  }

  return NextResponse.json({ error: "Expected {action:'request',email} or {action:'confirm',email,code,newPassword}" }, { status: 400 });
}

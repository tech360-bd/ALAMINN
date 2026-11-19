import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { hashResetCode, newResetCode } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/auth/ratelimit";
import { isEmailConfigured, sendEmail } from "@/lib/email/transport";

export const dynamic = "force-dynamic";

const emailSchema = z.string().trim().email().max(191).transform((email) => email.toLowerCase());
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), email: emailSchema }),
  z.object({ action: z.literal("confirm"), email: emailSchema, code: z.string().regex(/^\d{6}$/), newPassword: z.string().min(10).max(200) }),
]);
const TTL = 15 * 60_000;
const generic = { ok: true, message: "If the account is eligible, a code will be sent to the registered inbox." };
const headers = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid password reset request" }, { status: 400, headers });
  const input = parsed.data;
  const ip = clientIp(req);
  const limit = input.action === "request" ? 5 : 10;
  for (const key of [`pwreset:${input.action}:ip:${ip}`, `pwreset:${input.action}:email:${input.email}`]) {
    const result = rateLimit({ key, limit, windowMs: TTL });
    if (!result.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { ...headers, "Retry-After": String(result.retryAfterSec) } });
  }

  if (input.action === "request" && !isEmailConfigured()) {
    return NextResponse.json({ error: "Self-service password recovery is unavailable. Contact a staff administrator." }, { status: 503, headers });
  }
  const account = await db.staffAccount.findUnique({ where: { email: input.email }, select: { id: true, email: true, isActive: true } });
  if (input.action === "request") {
    if (!account?.isActive) return NextResponse.json(generic, { headers });
    const code = newResetCode();
    const reset = await db.$transaction(async (tx) => {
      // Serialize requests for this account; concurrent requests cannot leave
      // multiple valid codes behind. Confirmation locks the same row first.
      await tx.staffAccount.update({ where: { id: account.id }, data: { updatedAt: new Date() } });
      await tx.passwordResetCode.deleteMany({ where: { accountId: account.id, usedAt: null } });
      const row = await tx.passwordResetCode.create({ data: { accountId: account.id, codeHash: hashResetCode(account.id, code), expiresAt: new Date(Date.now() + TTL) } });
      await tx.uciAuditLog.create({ data: { actor: account.email, action: "auth.password_reset_requested", entity: "StaffAccount", entityId: account.id } });
      return row;
    });
    const result = await sendEmail({
      to: account.email,
      subject: "Staff password reset code",
      text: `Your staff password reset code is ${code}. It expires in 15 minutes. Ignore this email if you did not request a reset.`,
      html: `<p>Your staff password reset code is <strong>${code}</strong>. It expires in 15 minutes.</p><p>Ignore this email if you did not request a reset.</p>`,
    });
    if (!result.success || result.provider === "console") {
      await db.passwordResetCode.deleteMany({ where: { id: reset.id, usedAt: null } });
      console.warn("[staff-reset] delivery failed");
    }
    return NextResponse.json(generic, { headers });
  }

  const invalid = () => NextResponse.json({ error: "Invalid or expired code" }, { status: 400, headers });
  if (!account?.isActive) return invalid();
  const passwordHash = await hashPassword(input.newPassword);
  const claimed = await db.$transaction(async (tx) => {
    const active = await tx.staffAccount.updateMany({ where: { id: account.id, isActive: true }, data: { updatedAt: new Date() } });
    if (active.count !== 1) return false;
    const now = new Date();
    const challenge = await tx.passwordResetCode.findFirst({
      where: { accountId: account.id, usedAt: null, expiresAt: { gt: now }, attempts: { lt: 5 } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (!challenge) return false;
    const match = challenge.codeHash === hashResetCode(account.id, input.code);
    const codes = await tx.passwordResetCode.updateMany({
      where: { id: challenge.id, usedAt: null, attempts: challenge.attempts, expiresAt: { gt: now } },
      data: { attempts: { increment: 1 }, ...(match ? { usedAt: now } : {}) },
    });
    if (!match || codes.count !== 1) return false;
    await tx.staffAccount.update({ where: { id: account.id }, data: { passwordHash } });
    await tx.staffSession.deleteMany({ where: { accountId: account.id } });
    await tx.uciAuditLog.create({ data: { actor: account.email, action: "auth.password_reset_confirmed", entity: "StaffAccount", entityId: account.id } });
    return true;
  });
  if (!claimed) return invalid();
  return NextResponse.json({ ok: true, message: "Password updated. All sessions were revoked; please sign in again." }, { headers });
}

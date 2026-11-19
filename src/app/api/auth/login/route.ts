import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/auth/ratelimit";

export const dynamic = "force-dynamic";

const DUMMY_HASH = `scrypt$${"00".repeat(16)}$${"00".repeat(64)}`;
const bodySchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

/** POST /api/auth/login — real credential check, revocable DB session, httpOnly cookie. */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const rl = rateLimit({ key: `login:${ip}:${email}`, limit: 10, windowMs: 5 * 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many failed logins. Try again in ${rl.retryAfterSec}s.` },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }

  const account = await db.staffAccount.findUnique({ where: { email } });
  const ok = await verifyPassword(parsed.data.password, account?.passwordHash ?? DUMMY_HASH);
  if (!account || !ok) {
    // Constant-shape response: never reveal whether the account exists.
    await db.uciAuditLog.create({
      data: { actor: email, action: "auth.login_failed", entity: "StaffAccount", entityId: "-", detail: JSON.stringify({ ip }) },
    }).catch(() => {});
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  if (!account.isActive) {
    return NextResponse.json({ error: "This account is deactivated. Contact an administrator." }, { status: 403 });
  }

  // Lock and recheck the credential used for verification before issuing a
  // session. Reset and administrative password changes lock the same row.
  const issued = await db.$transaction(async (tx) => {
    const changed = await tx.staffAccount.updateMany({
      where: { id: account.id, passwordHash: account.passwordHash, isActive: true, role: account.role },
      data: { lastLoginAt: new Date() },
    });
    if (changed.count !== 1) return null;
    const session = await createSession(account.id, account.role, { ip, userAgent: req.headers.get("user-agent") ?? undefined }, tx);
    await tx.uciAuditLog.create({
      data: { actor: account.email, action: "auth.login", entity: "StaffAccount", entityId: account.id, detail: JSON.stringify({ ip }) },
    });
    return session;
  });
  if (!issued) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  await setSessionCookie(issued.token, issued.expiresAt);

  return NextResponse.json({ ok: true, account: { email: account.email, name: account.name, role: account.role } });
}

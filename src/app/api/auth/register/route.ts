import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { getSessionUser } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/auth/ratelimit";
import { can } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(10).max(200),
  name: z.string().min(2).max(100),
  role: z.enum(["ADMIN", "EDITOR", "AGENT", "VIEWER"]).optional(),
});

/**
 * POST /api/auth/register
 * Requires an authenticated staff administrator. First-account setup is CLI-only.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit({ key: `register:${clientIp(req)}`, limit: 5, windowMs: 15 * 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts, slow down." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Valid email, name and a password of at least 10 characters are required." },
      { status: 400 },
    );
  }
  const { email, password, name } = parsed.data;

  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!can(session.role, "users.manage")) return NextResponse.json({ error: "Only ADMIN can create accounts" }, { status: 403 });
  const role = parsed.data.role ?? "VIEWER";

  const emailNorm = email.trim().toLowerCase();
  const duplicate = await db.staffAccount.findUnique({ where: { email: emailNorm } });
  if (duplicate) return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });

  const account = await db.staffAccount.create({
    data: { email: emailNorm, passwordHash: await hashPassword(password), name: name.trim(), role },
  });
  await db.uciAuditLog.create({
    data: {
      actor: session.email,
      action: "auth.account_created",
      entity: "StaffAccount",
      entityId: account.id,
      detail: JSON.stringify({ role, email: emailNorm }),
    },
  });

  return NextResponse.json(
    { ok: true, account: { id: account.id, email: account.email, name: account.name, role: account.role } },
    { status: 201 },
  );
}

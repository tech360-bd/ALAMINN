import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { getSessionUser } from "@/lib/auth/session";
import { STAFF_ROLES, can } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(2).max(100),
  password: z.string().min(10).max(200),
  role: z.enum(["ADMIN", "EDITOR", "AGENT", "VIEWER"]),
});

/** GET /api/staff — list staff accounts (ADMIN, users.manage). */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!can(session.role, "users.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const accounts = await db.staffAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  return NextResponse.json({ accounts });
}

/** POST /api/staff — create a staff account (ADMIN, users.manage). */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!can(session.role, "users.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "email, name, password (min 10 chars) and role are required" }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const duplicate = await db.staffAccount.findUnique({ where: { email } });
  if (duplicate) return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });

  const account = await db.staffAccount.create({
    data: {
      email,
      name: parsed.data.name.trim(),
      role: (STAFF_ROLES as readonly string[]).includes(parsed.data.role) ? parsed.data.role : "VIEWER",
      passwordHash: await hashPassword(parsed.data.password),
    },
  });
  await db.uciAuditLog.create({
    data: {
      actor: session.email, action: "auth.account_created", entity: "StaffAccount", entityId: account.id,
      detail: JSON.stringify({ role: account.role, email }),
    },
  });
  return NextResponse.json({ ok: true, account: { id: account.id, email: account.email, name: account.name, role: account.role } }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { getSessionUser } from "@/lib/auth/session";
import { can, STAFF_ROLES } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(["ADMIN", "EDITOR", "AGENT", "VIEWER"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(10).max(200).optional(),
});

async function loadTarget(id: string) {
  return db.staffAccount.findUnique({ where: { id } });
}

/** Count active admins other than the given account id. */
async function activeAdminsExcluding(id: string): Promise<number> {
  const admins = await db.staffAccount.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
  return admins.filter((a) => a.id !== id).length;
}

/** PATCH /api/staff/[id] — update name/role/active/password (ADMIN, users.manage). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!can(session.role, "users.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const target = await loadTarget(id);
  if (!target) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const patch = parsed.data;

  // Guard: never demote/deactivate yourself, and never the last active admin.
  if (patch.role === undefined && patch.isActive === undefined && patch.password === undefined && patch.name === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const losesAdmin = target.role === "ADMIN" && target.isActive && ((patch.role && patch.role !== "ADMIN") || patch.isActive === false);
  if (losesAdmin && (await activeAdminsExcluding(id)) < 1) {
    return NextResponse.json({ error: "Cannot demote or deactivate the last active admin" }, { status: 422 });
  }
  if (id === session.accountId && (patch.isActive === false || (patch.role && patch.role !== "ADMIN"))) {
    return NextResponse.json({ error: "You cannot demote or deactivate your own account" }, { status: 422 });
  }

  const data: Record<string, unknown> = {};
  if (patch.name) data.name = patch.name.trim();
  if (patch.role) data.role = patch.role;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.password) data.passwordHash = await hashPassword(patch.password);

  const updated = await db.staffAccount.update({ where: { id }, data, select: { id: true, email: true, name: true, role: true, isActive: true } });
  if (patch.isActive === false || patch.role) {
    // Role change or deactivation revokes existing sessions (RBAC takes effect immediately).
    await db.staffSession.deleteMany({ where: { accountId: id } });
  }
  await db.uciAuditLog.create({
    data: {
      actor: session.email, action: "auth.account_updated", entity: "StaffAccount", entityId: id,
      detail: JSON.stringify({ patch: { ...patch, password: patch.password ? "[redacted]" : undefined } }),
    },
  });
  return NextResponse.json({ ok: true, account: updated });
}

/** DELETE /api/staff/[id] — deactivate (soft delete) an account (ADMIN). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!can(session.role, "users.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  if (id === session.accountId) {
    return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 422 });
  }
  const target = await loadTarget(id);
  if (!target) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (target.role === "ADMIN" && target.isActive) {
    const activeAdmins = await db.staffAccount.count({ where: { role: "ADMIN", isActive: true } });
    if (activeAdmins <= 1) return NextResponse.json({ error: "Cannot deactivate the last active admin" }, { status: 422 });
  }

  await db.$transaction([
    db.staffAccount.update({ where: { id }, data: { isActive: false } }),
    db.staffSession.deleteMany({ where: { accountId: id } }),
    db.uciAuditLog.create({
      data: { actor: session.email, action: "auth.account_deactivated", entity: "StaffAccount", entityId: id },
    }),
  ]);
  return NextResponse.json({ ok: true });
}

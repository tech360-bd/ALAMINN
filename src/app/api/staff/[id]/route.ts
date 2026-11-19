import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(["ADMIN", "EDITOR", "AGENT", "VIEWER"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(10).max(200).optional(),
});

class StaffChangeError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function mutationError(error: unknown) {
  if (error instanceof StaffChangeError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
    return NextResponse.json({ error: "Concurrent account change; refresh and retry" }, { status: 409 });
  }
  throw error;
}

/** PATCH /api/staff/[id] — update name/role/active/password (ADMIN, users.manage). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!can(session.role, "users.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const patch = parsed.data;

  // Guard: never demote/deactivate yourself, and never the last active admin.
  if (patch.role === undefined && patch.isActive === undefined && patch.password === undefined && patch.name === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  if (id === session.accountId && (patch.isActive === false || (patch.role && patch.role !== "ADMIN"))) {
    return NextResponse.json({ error: "You cannot demote or deactivate your own account" }, { status: 422 });
  }

  const data: Record<string, unknown> = {};
  if (patch.name) data.name = patch.name.trim();
  if (patch.role) data.role = patch.role;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.password) data.passwordHash = await hashPassword(patch.password);

  try {
    const updated = await db.$transaction(async (tx) => {
      const actor = await tx.staffAccount.findUnique({ where: { id: session.accountId }, select: { isActive: true, role: true } });
      if (!actor?.isActive || actor.role !== "ADMIN") throw new StaffChangeError("Forbidden", 403);
      const target = await tx.staffAccount.findUnique({ where: { id } });
      if (!target) throw new StaffChangeError("Account not found", 404);
      const losesAdmin = target.role === "ADMIN" && target.isActive && ((patch.role && patch.role !== "ADMIN") || patch.isActive === false);
      if (losesAdmin && await tx.staffAccount.count({ where: { role: "ADMIN", isActive: true, id: { not: id } } }) === 0) {
        throw new StaffChangeError("Cannot demote or deactivate the last active admin", 422);
      }
      const account = await tx.staffAccount.update({ where: { id }, data, select: { id: true, email: true, name: true, role: true, isActive: true } });
      if (patch.isActive === false || patch.role || patch.password) {
        await tx.staffSession.deleteMany({ where: { accountId: id } });
        await tx.passwordResetCode.deleteMany({ where: { accountId: id } });
      }
      await tx.uciAuditLog.create({ data: {
        actor: session.email, action: "auth.account_updated", entity: "StaffAccount", entityId: id,
        detail: JSON.stringify({ patch: { ...patch, password: patch.password ? "[redacted]" : undefined } }),
      } });
      return account;
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true, account: updated });
  } catch (error) { return mutationError(error); }
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
  try {
    await db.$transaction(async (tx) => {
      const actor = await tx.staffAccount.findUnique({ where: { id: session.accountId }, select: { isActive: true, role: true } });
      if (!actor?.isActive || actor.role !== "ADMIN") throw new StaffChangeError("Forbidden", 403);
      const target = await tx.staffAccount.findUnique({ where: { id } });
      if (!target) throw new StaffChangeError("Account not found", 404);
      if (target.role === "ADMIN" && target.isActive && await tx.staffAccount.count({ where: { role: "ADMIN", isActive: true, id: { not: id } } }) === 0) {
        throw new StaffChangeError("Cannot deactivate the last active admin", 422);
      }
      await tx.staffAccount.update({ where: { id }, data: { isActive: false } });
      await tx.staffSession.deleteMany({ where: { accountId: id } });
      await tx.passwordResetCode.deleteMany({ where: { accountId: id } });
      await tx.uciAuditLog.create({ data: { actor: session.email, action: "auth.account_deactivated", entity: "StaffAccount", entityId: id } });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true });
  } catch (error) { return mutationError(error); }
}

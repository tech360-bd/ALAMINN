import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { destroySession, getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — revokes the session row and clears the cookie. */
export async function POST() {
  const user = await getSessionUser();
  await destroySession();
  if (user) {
    await db.uciAuditLog.create({
      data: { actor: user.email, action: "auth.logout", entity: "StaffAccount", entityId: user.accountId },
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

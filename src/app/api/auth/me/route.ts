import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { ROLE_PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — current session identity + effective permissions. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({
    account: { email: user.email, name: user.name, role: user.role },
    permissions: ROLE_PERMISSIONS[user.role] ?? [],
    sessionId: user.sessionId,
  });
}

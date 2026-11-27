import { db } from "@/lib/db";
import { createToken, verifyToken } from "@/lib/auth/jwt";

/** Only for isolated test databases: register the session for a signed token. */
export async function createTestAdminToken(userId: string, role: string, extra: { email?: string; name?: string } = {}) {
  const token = await createToken(userId, role, extra);
  const payload = await verifyToken(token);
  if (!payload) throw new Error("Failed to create test token");
  await db.adminSession.create({ data: { id: payload.sessionId, userId, expiresAt: new Date(payload.expiresAt * 1000) } });
  return token;
}

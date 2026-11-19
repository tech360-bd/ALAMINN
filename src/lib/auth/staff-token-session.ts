import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { resolveStaffSecret } from "./secret";
import { verifyToken } from "./token";
import { isStaffRole } from "./rbac";

export function staffTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Validate both the signed credential and its revocable persisted session. */
export async function authenticateStaffToken(db: Pick<PrismaClient, "staffSession">, token?: string) {
  const secret = resolveStaffSecret();
  if (!secret || !token) return null;
  const payload = await verifyToken(token, secret);
  if (!payload) return null;
  const session = await db.staffSession.findUnique({ where: { tokenHash: staffTokenHash(token) }, include: { account: true } });
  if (!session || session.id !== payload.sid || session.accountId !== payload.uid || session.expiresAt.getTime() <= Date.now() ||
      !session.account.isActive || !isStaffRole(session.account.role)) return null;
  return { sessionId: session.id, accountId: session.accountId, email: session.account.email, name: session.account.name, role: session.account.role };
}

/**
 * Server-side session management (node runtime).
 * - Cookie: httpOnly, SameSite=Lax, Secure in production.
 * - Every token maps to a revocable StaffSession row (tokenHash = staffTokenHash(token)).
 * - getSessionUser() is the single source of truth for API routes: it verifies
 *   the HMAC, then confirms the session still exists and the account is active.
 */
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signToken } from "./token";
import { resolveStaffSecret } from "./secret";
import { authenticateStaffToken, staffTokenHash } from "./staff-token-session";
import type { StaffRole } from "./rbac";

export interface SessionUser {
  sessionId: string;
  accountId: string;
  email: string;
  name: string;
  role: StaffRole;
}

export function sessionSecret(): string {
  const secret = resolveStaffSecret();
  if (!secret) {
    throw new Error("SESSION_SECRET is missing or too short — refusing to issue sessions.");
  }
  return secret;
}

export async function createSession(
  accountId: string,
  role: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const session = await db.staffSession.create({
    data: {
      accountId,
      // Unique per-row placeholder replaced by staffTokenHash(token) below — prevents
      // unique-constraint collisions when sessions are created concurrently.
      tokenHash: randomBytes(24).toString("hex"),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      expiresAt,
    },
  });
  const token = await signToken(
    { sid: session.id, uid: accountId, role, exp: Math.floor(expiresAt.getTime() / 1000) },
    sessionSecret(),
  );
  await db.staffSession.update({ where: { id: session.id }, data: { tokenHash: staffTokenHash(token) } });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** Full verification: HMAC + DB row + active account. Returns null when unauthenticated. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return authenticateStaffToken(db, token);
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.staffSession.deleteMany({ where: { tokenHash: staffTokenHash(token) } });
  }
  await clearSessionCookie();
}

/** Pair with middleware for the `next=` redirect target. */
export function sanitizeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export function newResetCode(): string {
  return String(randomInt(1_000_000)).padStart(6, "0");
}

export function hashResetCode(accountId: string, code: string): string {
  return createHmac("sha256", sessionSecret()).update(`staff-reset:${accountId}:${code}`).digest("hex");
}

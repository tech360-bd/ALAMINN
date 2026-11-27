/**
 * JWT codec — jose (HS256), the single token format for the platform.
 * -----------------------------------------------------------------
 * Phase 1 (Rule 1): ONE authentication system.
 *
 *   - Tokens are signed with `jose` (HS256, 24 hour expiry).
 *   - The token lives in the httpOnly `auth_token` cookie. It is never
 *     written to localStorage and never sent as an Authorization: Bearer
 *     header by the frontend.
 *   - This module is deliberately dependency-light (no Prisma, no
 *     next/headers) so the same verification runs in both the Node.js
 *     route handlers and `src/proxy.ts`.
 *
 * The signing secret is resolved through `env()` so there is exactly one
 * source of truth:
 *   JWT_SECRET (preferred, see .env.config) → AUTH_SECRET (legacy) → dev fallback.
 */
import { SignJWT, jwtVerify } from "jose";
import { resolveAuthSecret } from "@/lib/auth/secret";
import { ALL_ROLES, normalizeRole, type UserRole } from "@/lib/rbac";

/** Cookie that carries the JWT. Rule 1: httpOnly, never localStorage. */
export const AUTH_COOKIE = "auth_token";

/** 24 hours — Rule 1b. */
export const TOKEN_TTL_SECONDS = 60 * 60 * 24;

/** Payload returned by `verifyToken()`. */
export type AuthToken = {
  /** User.id */
  userId: string;
  role: UserRole;
  /** Unique identifier of the server-side session. */
  sessionId: string;
  email: string;
  name: string;
  /** Epoch seconds */
  expiresAt: number;
};

const encoder = new TextEncoder();

function secretKey(): Uint8Array {
  return encoder.encode(resolveAuthSecret());
}

/**
 * Create a signed JWT for a user. 24 hour expiry.
 * Kept async because jose's signer is async — callers must await.
 */
export async function createToken(
  userId: string,
  role: string,
  extra: { email?: string; name?: string; sessionId?: string } = {}
): Promise<string> {
  const normalized = normalizeRole(role);
  if (!normalized) throw new Error(`createToken: invalid role "${role}"`);

  return new SignJWT({
    role: normalized,
    email: extra.email ?? "",
    name: extra.name ?? "",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setJti(extra.sessionId ?? crypto.randomUUID())
    .setIssuedAt()
    .setIssuer("alaminn.info")
    .setAudience("alaminn-admin")
    .setExpirationTime("24h")
    .sign(secretKey());
}

/**
 * Verify a JWT. Returns the decoded payload, or null when the token is
 * missing, malformed, tampered with, expired, or carries an unknown role.
 * Never throws.
 */
export async function verifyToken(token: string | undefined | null): Promise<AuthToken | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      issuer: "alaminn.info",
      audience: "alaminn-admin",
    });

    const userId = payload.sub;
    const role = normalizeRole(typeof payload.role === "string" ? payload.role : "");
    if (!userId || !role || !ALL_ROLES.includes(role)) return null;
    if (typeof payload.exp !== "number" || typeof payload.jti !== "string" || !payload.jti) return null;

    return {
      userId,
      role,
      sessionId: payload.jti,
      email: typeof payload.email === "string" ? payload.email : "",
      name: typeof payload.name === "string" ? payload.name : "",
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}

/** Cookie options for the auth token (used by login / logout). */
export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  };
}

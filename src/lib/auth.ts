/**
 * Authentication — custom JWT (jose), httpOnly cookie, one system.
 * -------------------------------------------------------------------
 * Rule 1 (non-negotiable):
 *   - Tokens are signed JWTs (jose, HS256, 24h) stored in the httpOnly
 *     `auth_token` cookie. The browser never sees or stores the token,
 *     and the frontend never sends `Authorization: Bearer`.
 *   - No NextAuth. No localStorage. No second token format.
 *   - `requireAuth()` / `requirePermission()` are the only server-side
 *     entry points; both re-check the user against the database so a
 *     suspended account or changed role takes effect immediately.
 *
 * Token creation/verification itself lives in `@/lib/auth/jwt` so the same
 * code runs in `src/proxy.ts` and in Node route handlers.
 *
 * Password hashing: bcrypt (Rule 1b). Legacy scrypt hashes created by
 * earlier builds are still accepted by `verifyPassword()` and are upgraded
 * transparently on the next successful login.
 */
import { cookies } from "next/headers";
import { timingSafeEqual, randomBytes, scryptSync } from "crypto";
import { hashSync, compareSync } from "bcryptjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeRole, type UserRole, type Permission } from "@/lib/rbac";
import { AUTH_COOKIE, TOKEN_TTL_SECONDS, createToken, verifyToken, authCookieOptions } from "@/lib/auth/jwt";

/** Legacy cookie used by pre-JWT builds. Cleared on login/logout. */
const LEGACY_COOKIE = "alaminn_session";
const BCRYPT_ROUNDS = 12;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };

/** A constant bcrypt hash used to equalise timing for unknown emails. */
export const TIMING_DUMMY_HASH =
  "$2b$12$ossjYoXLJMBA13FG9mSeTuomOBumIKYCH1GiMHJW4NLn7VtYlVYwW";

// Re-export the JWT primitives required by Rule 1b.
export { AUTH_COOKIE, TOKEN_TTL_SECONDS, createToken, verifyToken };

export type Session = {
  userId: string;
  role: UserRole;
  email: string;
  name: string;
  expiresAt: number; // epoch sec
};

export type Auth = {
  authSecret: string;
};

/**
 * Hash a password with bcrypt (12 rounds).
 * Synchronous by design: it is only used in seed scripts and the handful of
 * routes that create/reset passwords, never on a hot path.
 */
export function hashPassword(password: string): string {
  return hashSync(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a stored hash.
 * Supports:
 *   - bcrypt (`$2a$`, `$2b$`, `$2y$`) — current format
 *   - scrypt (`scrypt$salt$hash`) — legacy format from earlier builds
 */
export function verifyPassword(password: string, stored: string): boolean {
  if (!password || !stored) return false;
  try {
    if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
      return compareSync(password, stored);
    }
    if (stored.startsWith("scrypt$")) {
      const [, salt, hash] = stored.split("$");
      if (!salt || !hash) return false;
      const candidate = scryptSync(password, salt, 64, SCRYPT_PARAMS).toString("hex");
      const a = Buffer.from(hash, "hex");
      const b = Buffer.from(candidate, "hex");
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    }
    return false;
  } catch {
    return false;
  }
}

/** True when the stored hash still uses the legacy scrypt format. */
export function needsPasswordRehash(stored: string): boolean {
  return stored.startsWith("scrypt$");
}

/**
 * Build, sign, and set the JWT session cookie. Called after successful login.
 * Also clears the legacy pre-JWT cookie so there is only ever one session.
 */
export async function setSessionCookie(user: {
  id: string;
  email: string;
  name: string;
  role: string;
}) {
  const role = normalizeRole(user.role) ?? "VIEWER";
  const token = await createToken(user.id, role, { email: user.email, name: user.name });

  const store = await cookies();
  store.set(AUTH_COOKIE, token, authCookieOptions());
  try {
    store.delete(LEGACY_COOKIE);
  } catch {
    // no-op
  }

  try {
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  } catch {
    // non-fatal
  }
}

/** Clear the session cookie(s). */
export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
  try {
    store.delete(LEGACY_COOKIE);
  } catch {
    // no-op
  }
}

/**
 * Read & validate the session from the cookie store.
 * Returns null if: no cookie, invalid signature, expired token, or the
 * user no longer exists / is not active.
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  try {
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, role: true, status: true },
    });
    if (!user || user.status !== "active") return null;
    const currentRole = normalizeRole(user.role) ?? payload.role;
    return {
      userId: user.id,
      role: currentRole,
      email: user.email,
      name: user.name,
      expiresAt: payload.expiresAt,
    };
  } catch {
    // DB error — fail closed
    return null;
  }
}

/**
 * Read & validate the JWT from a NextRequest (route handlers).
 * Signature + expiry are checked here; callers that need live account
 * state (requireAuth / requirePermission) also re-check the database.
 */
export async function getSessionFromRequest(req: NextRequest): Promise<Session | null> {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return {
    userId: payload.userId,
    role: payload.role,
    email: payload.email,
    name: payload.name,
    expiresAt: payload.expiresAt,
  };
}

function unauthorized(message = "Authentication required.") {
  return NextResponse.json(
    {
      success: false,
      error: "unauthorized",
      message,
      data: null,
      meta: {},
      errors: ["unauthenticated"],
    },
    { status: 401 }
  );
}

/**
 * Route-handler auth guard (Rule 3a).
 *
 *   const auth = await requireAuth(req);
 *   if (!auth.user) return auth.error;
 *
 * Verifies the JWT *and* that the account still exists and is active.
 */
export async function requireAuth(
  req: NextRequest
): Promise<{ user: Session; error: null } | { user: null; error: NextResponse }> {
  const session = await getSessionFromRequest(req);
  if (!session) return { user: null, error: unauthorized() };

  try {
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, role: true, status: true },
    });
    if (!user || user.status !== "active") {
      return { user: null, error: unauthorized("Account is not active.") };
    }
    const role = normalizeRole(user.role);
    if (!role) {
      return {
        user: null,
        error: NextResponse.json(
          { success: false, error: "forbidden", message: "Invalid role.", data: null, meta: {}, errors: ["role_invalid"] },
          { status: 403 }
        ),
      };
    }
    return {
      user: { userId: user.id, role, email: user.email, name: user.name, expiresAt: session.expiresAt },
      error: null,
    };
  } catch {
    return {
      user: null,
      error: NextResponse.json(
        { success: false, error: "server_error", message: "Authentication check failed.", data: null, meta: {}, errors: ["auth_check_failed"] },
        { status: 500 }
      ),
    };
  }
}

/**
 * Route-handler permission guard. Returns the session if the user has `perm`,
 * otherwise a 401/403 NextResponse.
 *
 *   const guard = await requirePermission(req, "contacts.view");
 *   if (guard.denied) return guard.response;
 */
export async function requirePermission(
  req: NextRequest,
  perm: Permission
): Promise<{ denied: true; response: Response } | { denied: false; session: Session }> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return { denied: true, response: unauthorized() };
  }

  try {
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, role: true, status: true },
    });
    if (!user || user.status !== "active") {
      return { denied: true, response: unauthorized("Account is not active.") };
    }
    const currentRole = normalizeRole(user.role);
    if (!currentRole) {
      return {
        denied: true,
        response: NextResponse.json(
          { success: false, error: "forbidden", message: "Invalid role.", data: null, meta: {}, errors: ["role_invalid"] },
          { status: 403 }
        ),
      };
    }
    const { hasPermission } = await import("@/lib/rbac");
    if (!hasPermission(currentRole, perm)) {
      return {
        denied: true,
        response: NextResponse.json(
          { success: false, error: "forbidden", message: "Insufficient permissions.", data: null, meta: {}, errors: ["forbidden"] },
          { status: 403 }
        ),
      };
    }
    return {
      denied: false,
      session: { ...session, role: currentRole, email: user.email, name: user.name },
    };
  } catch {
    return {
      denied: true,
      response: NextResponse.json(
        { success: false, error: "server_error", message: "Authentication check failed.", data: null, meta: {}, errors: ["auth_check_failed"] },
        { status: 500 }
      ),
    };
  }
}

/** Generate a random token (for newsletter verification, password reset, etc.). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

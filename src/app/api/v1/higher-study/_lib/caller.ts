/**
 * Shared helpers for Higher Study "personal list" public APIs
 * (saved items, comparisons, alerts).
 *
 * These APIs support BOTH anonymous callers (identified by a
 * client-generated `sessionId` stored in localStorage) AND authenticated
 * Alaminn.info users (identified by the signed session cookie).
 *
 * Security invariants:
 *   - Authenticated sessions always take precedence over client-supplied
 *     `sessionId` values.
 *   - Anonymous `sessionId` values must be 8–128 URL-safe characters
 *     (`[A-Za-z0-9_-]`) — short, empty, or placeholder values (`"null"`,
 *     `"undefined"`) are rejected.
 *   - Anonymous lookups explicitly scope queries with `userId: null` so
 *     an anonymous caller with a guessed/shared `sessionId` can never
 *     read, modify, or delete records owned by an authenticated user.
 */
import type { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { safeString } from "@/lib/higher-study/api-helpers";

export interface CallerContext {
  userId: string | null;
  sessionId: string | null;
  /** `true` if the caller is authenticated (userId present). */
  authenticated: boolean;
}

const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

export function isValidAnonymousSessionId(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (trimmed === "null" || trimmed === "undefined") return false;
  return SESSION_ID_RE.test(trimmed);
}

/**
 * Resolve the caller from a request. Authenticated sessions take
 * precedence; otherwise the caller must provide a valid `sessionId`
 * query param (GET/DELETE) or `sessionId` body field (POST/DELETE) or
 * `x-session-id` header.
 */
export async function resolveCaller(
  req: NextRequest,
  body?: Record<string, unknown> | null,
): Promise<CallerContext> {
  const session = await getSessionFromRequest(req);
  if (session?.userId) {
    return { userId: session.userId, sessionId: null, authenticated: true };
  }
  const url = new URL(req.url);
  const candidate =
    safeString(body?.sessionId as string | undefined) ||
    safeString(url.searchParams.get("sessionId")) ||
    safeString(req.headers.get("x-session-id"));
  const validSessionId = isValidAnonymousSessionId(candidate) ? candidate : null;
  return {
    userId: null,
    sessionId: validSessionId,
    authenticated: false,
  };
}

/**
 * Returns the Prisma where-clause fragment identifying a caller's
 * personal list items. Returns `null` if the caller provided neither
 * a userId nor a valid sessionId (must reject).
 */
export function callerWhere(
  ctx: CallerContext,
): { userId: string } | { sessionId: string; userId: null } | null {
  if (ctx.userId) return { userId: ctx.userId };
  if (ctx.sessionId) return { sessionId: ctx.sessionId, userId: null };
  return null;
}

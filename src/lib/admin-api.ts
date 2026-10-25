/**
 * Admin API helpers — shared response + audit helpers for /api/v1/admin/*.
 * -----------------------------------------------------------------
 * Every admin route follows the same shape:
 *   - AuthN/Z via `requirePermission` (signed session cookie).
 *   - JSON envelope: { success, message, data, meta, errors }.
 *   - Audit log entry on every state-changing action.
 *
 * This module keeps the routes thin — the routes call `ok()` / `fail()`
 * and `writeAudit()` instead of repeating boilerplate.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Session } from "@/lib/auth";

export type ApiMeta = Record<string, unknown>;

export function ok(data: unknown, message = "OK", meta: ApiMeta = {}, status: number = 200) {
  return NextResponse.json({ success: true, message, data, meta, errors: [] }, { status });
}

export function fail(
  message: string,
  errors: unknown[] = [],
  status = 400,
  meta: ApiMeta = {}
) {
  return NextResponse.json(
    { success: false, message, data: null, meta, errors },
    { status }
  );
}

/** Parse ?page=N&pageSize=N (defaults: 1/25, capped at 100). */
export function pagination(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("pageSize") || "25") || 25)
  );
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Read ?q=search and any ?field=value filters as a Prisma `where` clause. */
export function searchField(req: Request, _fields: string[]): string | null {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  return q || null;
}

/** Build a Prisma `where` for case-insensitive search across multiple string fields. */
export function searchWhere(q: string | null, fields: string[]) {
  if (!q) return {};
  // SQLite uses `contains` (case-insensitive by default for ASCII).
  // We OR across the requested fields.
  return {
    OR: fields.map((f) => ({ [f]: { contains: q } })),
  };
}

/** Write an audit log row. Best-effort — never throws. */
export async function writeAudit(
  session: Session,
  action: string,
  resource: string,
  resourceId?: string,
  meta?: Record<string, unknown>
) {
  try {
    await db.auditLog.create({
      data: {
        actorId: session.userId,
        action,
        resource,
        resourceId,
        meta: meta ? JSON.stringify(meta) : null,
      },
    });
  } catch {
    // non-fatal
  }
}

/** Read JSON body safely. Returns null on parse error. */
export async function readJson<T = Record<string, unknown>>(
  req: Request
): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Get a single query param as a string, or null. */
export function param(req: Request, key: string): string | null {
  return new URL(req.url).searchParams.get(key);
}

/** Check whether a Setting key holds a secret, password, API key, or token. */
export function isSensitiveSettingKey(key: string): boolean {
  return /(pass|secret|token|apikey|api_key|\.key$|credential|private|accountid)/i.test(key);
}

// ─── Bounded sliding-window in-memory rate limiter for Admin AI endpoints ────
interface AdminRateBucket {
  count: number;
  resetAt: number;
}
const adminRateBuckets = new Map<string, AdminRateBucket>();
const MAX_RATE_BUCKETS = 4096;

export function checkAdminRateLimit(
  bucketKey: string,
  maxRequests: number,
  windowMs = 60_000
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (adminRateBuckets.size > MAX_RATE_BUCKETS) {
    for (const [k, v] of adminRateBuckets.entries()) {
      if (v.resetAt <= now) adminRateBuckets.delete(k);
    }
  }
  const existing = adminRateBuckets.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    adminRateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}


import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import type { Permission } from "@/lib/rbac";
import { checkAdminRateLimit, writeAudit } from "@/lib/admin-api-server";
import type { Session } from "@/lib/auth";
import { sameOrigin } from "./support";

export function kitOk(data: unknown, message = "Saved.", status = 200) {
  return NextResponse.json({ success: true, data, message, meta: {}, errors: [] }, { status, headers: { "Cache-Control": "no-store" } });
}
export function kitError(message: string, status = 400) {
  return NextResponse.json({ success: false, data: null, message, meta: {}, errors: [message] }, { status, headers: { "Cache-Control": "no-store" } });
}
/** Same-origin mutations + schema validation + centralized error redaction. */
export async function kitAction<T>(req: NextRequest, permission: Permission, schema: z.ZodType<T>, action: (data: T, session: Session) => Promise<Response>) {
  const guard = await requirePermission(req, permission);
  if (guard.denied) { const response = guard.response; response.headers.set("Cache-Control", "no-store"); return response; }
  if (!sameOrigin(req)) return kitError("Cross-origin request rejected.", 403);
  if (!checkAdminRateLimit(`kit:${guard.session.userId}`, 120).allowed) return kitError("Too many requests. Please wait a minute.", 429);
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 150000) return kitError("Request is too large.", 413);
  const raw = await req.text();
  if (raw.length > 150000) return kitError("Request is too large.", 413);
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return kitError("Invalid JSON body."); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return kitError(parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "), 422);
  try { return await action(parsed.data, guard.session); }
  catch (error) {
    console.error("[feature-kit] action failed", error instanceof Error ? error.message : "unknown");
    return kitError("The operation could not be completed. Check your inputs and server configuration.", 500);
  }
}
export async function kitRead(req: NextRequest, permission: Permission, action: (session: Session) => Promise<Response>) {
  const guard = await requirePermission(req, permission);
  if (guard.denied) { const response = guard.response; response.headers.set("Cache-Control", "no-store"); return response; }
  try { return await action(guard.session); } catch { return kitError("Could not load data. Check the database migration and try again.", 500); }
}
export async function kitAudit(session: Session, action: string, resource: string, id: string, meta?: Record<string, unknown>) { await writeAudit(session, action, resource, id, meta); }

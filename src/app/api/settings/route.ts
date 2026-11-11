import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings — tenant settings for the settings dashboard.
 * PATCH /api/settings — save tenant settings (RBAC: settings.write = ADMIN).
 * Values are validated; nothing is silently coerced. The messaging window is
 * enforced by the messaging-channel service from these very values.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const tenant = await db.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) return NextResponse.json({ error: "No tenant provisioned yet" }, { status: 404 });
  return NextResponse.json({
    tenant: {
      id: tenant.id, slug: tenant.slug, name: tenant.name, timezone: tenant.timezone,
      messagingStart: tenant.messagingStart, messagingEnd: tenant.messagingEnd,
      languages: tenant.languages, aiAutoReply: tenant.aiAutoReply, createdAt: tenant.createdAt,
    },
  });
}

function validatePatch(input: unknown): { ok: boolean; data: Record<string, unknown>; errors: string[] } {
  const b = (input ?? {}) as {
    name?: unknown; timezone?: unknown; messagingStart?: unknown;
    messagingEnd?: unknown; languages?: unknown; aiAutoReply?: unknown;
  };
  const errors: string[] = [];
  const out: Record<string, unknown> = {};
  if (b.name !== undefined) {
    if (typeof b.name !== "string" || b.name.trim().length < 2 || b.name.length > 120) errors.push("name must be 2-120 chars");
    else out.name = b.name.trim();
  }
  if (b.timezone !== undefined) {
    if (typeof b.timezone !== "string" || !/^[\w\-+/]{2,60}$/.test(b.timezone)) errors.push("invalid timezone");
    else out.timezone = b.timezone;
  }
  if (b.messagingStart !== undefined) {
    if (!Number.isInteger(b.messagingStart) || (b.messagingStart as number) < 0 || (b.messagingStart as number) > 23) errors.push("messagingStart must be 0-23 integer");
    else out.messagingStart = b.messagingStart;
  }
  if (b.messagingEnd !== undefined) {
    if (!Number.isInteger(b.messagingEnd) || (b.messagingEnd as number) < 0 || (b.messagingEnd as number) > 23) errors.push("messagingEnd must be 0-23 integer");
    else out.messagingEnd = b.messagingEnd;
  }
  if (b.languages !== undefined) {
    if (typeof b.languages !== "string" || b.languages.trim().length < 2) errors.push("languages must be a comma-separated list");
    else out.languages = b.languages.trim();
  }
  if (b.aiAutoReply !== undefined) {
    if (typeof b.aiAutoReply !== "boolean") errors.push("aiAutoReply must be boolean");
    else out.aiAutoReply = b.aiAutoReply;
  }
  return { ok: errors.length === 0, data: out, errors };
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!can(session.role, "settings.write")) {
    return NextResponse.json({ error: "ADMIN role required to change settings" }, { status: 403 });
  }

  const tenant = await db.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) return NextResponse.json({ error: "No tenant provisioned yet" }, { status: 404 });

  const parsed = validatePatch(await req.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ error: `Invalid settings: ${parsed.errors.join("; ")}` }, { status: 400 });
  }
  if (parsed.data.messagingStart !== undefined && parsed.data.messagingEnd !== undefined
      && parsed.data.messagingStart === parsed.data.messagingEnd) {
    return NextResponse.json({ error: "Messaging window start and end cannot be equal" }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await db.tenant.update({ where: { id: tenant.id }, data: parsed.data });
  await db.uciAuditLog.create({
    data: { actor: session.email, action: "SETTINGS_UPDATE", entity: "Tenant", entityId: tenant.id, detail: JSON.stringify(parsed.data) },
  });
  return NextResponse.json({ ok: true, tenant: updated });
}

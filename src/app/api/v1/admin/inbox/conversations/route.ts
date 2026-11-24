/** Cross-channel unified inbox: list/ingest conversations (RBAC + idempotency). */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { ingestInboxMessage } from "@/lib/inbox/ingest";

export const dynamic = "force-dynamic";

const IngestSchema = z.object({
  channel: z.enum(["email", "whatsapp", "messenger", "instagram", "website_chat", "social"]),
  accountId: z.string().trim().min(1).max(120),
  externalThreadId: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
  direction: z.enum(["inbound", "outbound"]).default("inbound"),
  subject: z.string().trim().max(200).optional(),
  displayName: z.string().trim().max(120).optional(),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(60).optional(),
  idempotencyKey: z.string().trim().max(200).optional(),
  attachments: z.array(z.object({
    name: z.string().max(180),
    url: z.string().max(500),
    mimeType: z.string().max(120).optional(),
    size: z.number().int().nonnegative().max(50_000_000).optional(),
  })).max(10).default([]),
});

function json(data: unknown, message: string, status = 200) {
  return NextResponse.json({ success: status < 400, message, data, meta: {}, errors: status < 400 ? [] : [message] }, { status });
}

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "inquiries.view");
  if (guard.denied) return guard.response;
  const params = req.nextUrl.searchParams;
  const status = params.get("status")?.trim();
  const channel = params.get("channel")?.trim();
  const q = params.get("q")?.trim().slice(0, 120) || "";
  const page = Math.max(1, Math.min(500, Number(params.get("page") || "1") || 1));
  const pageSize = Math.max(1, Math.min(100, Number(params.get("pageSize") || "20") || 20));

  const conversations = await db.inboxConversation.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(channel ? { channel } : {}),
      ...(q ? { OR: [
        { subject: { contains: q } },
        { externalThreadId: { contains: q } },
      ] } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const total = await db.inboxConversation.count({
    where: {
      ...(status ? { status } : {}),
      ...(channel ? { channel } : {}),
      ...(q ? { OR: [{ subject: { contains: q } }, { externalThreadId: { contains: q } }] } : {}),
    },
  });
  return json({ conversations, page, pageSize, total }, "Inbox conversations loaded.");
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "inquiries.create");
  if (guard.denied) return guard.response;
  let raw: unknown;
  try { raw = await req.json(); } catch { return json(null, "Invalid JSON.", 400); }
  const parsed = IngestSchema.safeParse(raw);
  if (!parsed.success) return json(null, "Invalid message payload.", 400);
  const input = parsed.data;

  const result = await ingestInboxMessage(input, guard.session);
  if (result.duplicate) return json(result, "Duplicate ingest ignored.");
  return json(result, "Message ingested.", 201);
}

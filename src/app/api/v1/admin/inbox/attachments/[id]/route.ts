/** Authenticated download of a private inbox attachment. */
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { INBOX_ATTACHMENT_DIR } from "@/lib/inbox/attachment-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const guard = await requirePermission(req, "inquiries.view");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const attachment = await db.inboxAttachment.findUnique({ where: { id } });
  if (!attachment) {
    return NextResponse.json({ success: false, message: "Attachment not found.", data: null, meta: {}, errors: ["not_found"] }, { status: 404 });
  }
  const absolute = resolve(INBOX_ATTACHMENT_DIR, attachment.storageKey);
  if (!absolute.startsWith(INBOX_ATTACHMENT_DIR + "/")) {
    return NextResponse.json({ success: false, message: "Invalid attachment path.", data: null, meta: {}, errors: ["path_invalid"] }, { status: 500 });
  }
  let bytes: Buffer;
  try { bytes = await readFile(absolute); } catch {
    return NextResponse.json({ success: false, message: "Attachment file is unavailable.", data: null, meta: {}, errors: ["file_missing"] }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `attachment; filename="${attachment.filename.replace(/"/g, "_")}"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

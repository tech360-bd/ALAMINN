/** Upload a private inbox attachment. RBAC + magic-byte validation + audit. */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/admin-api-server";
import { storeInboxAttachment, AttachmentValidationError } from "@/lib/inbox/attachment-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function failure(message: string, code: string, status: number) {
  return NextResponse.json({ success: false, message, data: null, meta: {}, errors: [code] }, { status });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "inquiries.update");
  if (guard.denied) return guard.response;
  const form = await req.formData().catch(() => null);
  if (!form) return failure("Expected multipart/form-data.", "invalid_form", 400);
  const file = form.get("file");
  const conversationId = String(form.get("conversationId") || "").trim();
  if (!(file instanceof File)) return failure("No file provided.", "missing_file", 400);
  if (!conversationId || conversationId.length > 120) return failure("Invalid conversation ID.", "invalid_conversation", 400);

  const conversation = await db.inboxConversation.findUnique({ where: { id: conversationId }, select: { id: true } });
  if (!conversation) return failure("Conversation not found.", "not_found", 404);

  try {
    const stored = await storeInboxAttachment(file);
    const attachment = await db.inboxAttachment.create({
      data: {
        conversationId,
        filename: stored.filename,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        size: stored.size,
      },
    });
    await writeAudit(guard.session, "inbox_attachment_uploaded", "InboxAttachment", attachment.id, {
      conversationId,
      mimeType: stored.mimeType,
      size: stored.size,
    });
    return NextResponse.json({
      success: true,
      message: "Attachment stored privately.",
      data: {
        id: attachment.id,
        name: attachment.filename,
        url: `/api/v1/admin/inbox/attachments/${attachment.id}`,
        mimeType: attachment.mimeType,
        size: attachment.size,
      },
      meta: {}, errors: [],
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AttachmentValidationError) return failure(error.message, error.code, error.status);
    return failure("Attachment storage failed.", "storage_failed", 500);
  }
}

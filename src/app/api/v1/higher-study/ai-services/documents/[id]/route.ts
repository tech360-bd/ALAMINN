/** GET / DELETE a single private Higher Study AI Service document. */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  AI_SERVICE_DOCUMENT_KIND,
  decodeDocumentContent,
  decodeMetadata,
} from "@/lib/higher-study/ai-services-documents";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

function unauthorizedResponse(auth: Awaited<ReturnType<typeof requireAuth>>) {
  return auth.user ? null : auth.error;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(req);
  const denied = unauthorizedResponse(auth);
  if (denied) return denied;

  const { id } = await ctx.params;
  const doc = await db.kitDocument.findFirst({
    where: { id, kind: AI_SERVICE_DOCUMENT_KIND, createdById: auth.user!.userId },
  });
  if (!doc) {
    return NextResponse.json(
      { success: false, message: "Document not found.", data: null, meta: {}, errors: ["not_found"] },
      { status: 404 }
    );
  }

  const meta = decodeMetadata(doc.metadata);
  const content = decodeDocumentContent(doc.content);
  return NextResponse.json({
    success: true,
    message: "Document loaded.",
    data: {
      id: doc.id,
      title: doc.title,
      serviceId: meta?.serviceId ?? content.serviceId,
      language: meta?.language ?? content.language,
      revision: meta?.revision ?? 1,
      rootId: meta?.rootId ?? doc.id,
      output: content.output,
      inputs: content.inputs,
      provider: content.provider,
      model: content.model,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    },
    meta: {},
    errors: [],
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(req);
  const denied = unauthorizedResponse(auth);
  if (denied) return denied;

  const { id } = await ctx.params;
  const result = await db.kitDocument.deleteMany({
    where: { id, kind: AI_SERVICE_DOCUMENT_KIND, createdById: auth.user!.userId },
  });
  if (!result.count) {
    return NextResponse.json(
      { success: false, message: "Document not found.", data: null, meta: {}, errors: ["not_found"] },
      { status: 404 }
    );
  }
  return NextResponse.json({
    success: true,
    message: "Document deleted.",
    data: { id },
    meta: {},
    errors: [],
  });
}

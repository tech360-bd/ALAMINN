/** GET /api/v1/higher-study/ai-services/documents — private saved drafts. */
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

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.user) return auth.error;

  const serviceId = req.nextUrl.searchParams.get("serviceId");
  const documents = await db.kitDocument.findMany({
    where: {
      kind: AI_SERVICE_DOCUMENT_KIND,
      createdById: auth.user.userId,
      ...(serviceId ? { metadata: { contains: serviceId } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    success: true,
    message: "Private documents loaded.",
    data: {
      documents: documents.map((doc) => {
        const meta = decodeMetadata(doc.metadata);
        const content = decodeDocumentContent(doc.content);
        return {
          id: doc.id,
          title: doc.title,
          serviceId: meta?.serviceId ?? content.serviceId,
          language: meta?.language ?? content.language,
          revision: meta?.revision ?? 1,
          rootId: meta?.rootId ?? doc.id,
          preview: content.output.slice(0, 180),
          createdAt: doc.createdAt.toISOString(),
          updatedAt: doc.updatedAt.toISOString(),
        };
      }),
    },
    meta: {},
    errors: [],
  });
}

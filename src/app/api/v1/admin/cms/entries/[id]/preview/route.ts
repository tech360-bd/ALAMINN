/**
 * Authenticated, noindex draft preview for CMS entries.
 * Preview never changes publication state and is not publicly reachable.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char] ?? char));
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const guard = await requirePermission(req, "articles.view");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const entry = await db.cmsEntry.findUnique({ where: { id } });
  if (!entry) {
    return NextResponse.json({ success: false, message: "Entry not found.", data: null, meta: {}, errors: ["not_found"] }, { status: 404 });
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>Preview: ${escapeHtml(entry.title)}</title></head><body><main><p>Preview — not published · status: ${escapeHtml(entry.status)}</p><h1>${escapeHtml(entry.title)}</h1><p>${escapeHtml(entry.summary)}</p><pre style="white-space:pre-wrap">${escapeHtml(entry.body)}</pre></main></body></html>`;
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

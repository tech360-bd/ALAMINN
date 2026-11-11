import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readFileSync } from "fs";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

const DATASET = "/home/z/my-project/scripts/audit/alo_dataset.json";

/**
 * GET /api/uci/audit — audit log + the Phase-1 existing-data audit summary
 * (recorded when the dataset was extracted; shown verbatim, nothing re-derived).
 * RBAC: audit.view (ADMIN, EDITOR) — the log carries reviewer identities.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!can(session.role, "audit.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [logs] = await Promise.all([
    db.uciAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  let phase1: unknown = null;
  try {
    const data = JSON.parse(readFileSync(DATASET, "utf-8"));
    phase1 = {
      extracted_at: data.extracted_at,
      source_files: data.source_files,
      summary: data.summary,
      issues: data.issues,
      priority27_coverage: data.priority27_coverage,
    };
  } catch {
    phase1 = null;
  }
  return NextResponse.json({ logs, phase1 });
}

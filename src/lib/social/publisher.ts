import { db } from "@/lib/db";
import { getAdapter } from "./adapters";
import { getGlobalState } from "./policy-server";
/** Publish due scheduled content. Separate switch from engagement (spec §5/§9). Fail-closed. Bounded: max 25/run. */
export async function publishDueContent(): Promise<{ published: number; failed: number; suppressed: number }> {
  const state = await getGlobalState();
  const due = await db.socialContent.findMany({ where: { status: "scheduled", scheduledAt: { lte: new Date() } }, take: 25, include: { targets: { include: { account: true } } } });
  let published = 0, failed = 0, suppressed = 0;
  for (const c of due) {
    if (!state?.publishingEnabled) { suppressed += c.targets.length; continue; } // separate publishing switch OFF
    await db.socialContent.update({ where: { id: c.id }, data: { status: "publishing" } });
    let anyOk = false;
    for (const t of c.targets) {
      if (t.status === "published") continue;
      // Re-verify approval + account health at the boundary.
      if (c.status !== "scheduled" && !c.approvedById) { await db.socialContentTarget.update({ where: { id: t.id }, data: { status: "suppressed", error: "not_approved" } }); suppressed++; continue; }
      const body = (() => { try { const v = JSON.parse(c.variants || "{}"); return v[t.account.platform] || c.body; } catch { return c.body; } })();
      const media = (() => { try { return JSON.parse(c.mediaUrls || "[]") as string[]; } catch { return []; } })();
      const r = await getAdapter(t.account.platform).publish(t.account, body, media);
      await db.socialContentTarget.update({ where: { id: t.id }, data: { status: r.status === "sent" ? "published" : r.status === "dev_pending" ? "published" : "failed", providerPostId: r.providerId, error: r.error, attempts: { increment: 1 }, publishedAt: r.status === "failed" ? null : new Date() } });
      if (r.status === "failed") failed++; else { published++; anyOk = true; }
    }
    await db.socialContent.update({ where: { id: c.id }, data: { status: anyOk ? "published" : "failed" } });
  }
  return { published, failed, suppressed };
}

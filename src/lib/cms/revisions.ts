/** Server-side revision snapshot helper for CMS entries. */
import { db } from "@/lib/db";
import { nextRevisionNumber } from "./state";

type EntryLike = {
  id: string;
  title: string;
  summary: string;
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
  status: string;
  authorId: string | null;
};

/** Persist an immutable snapshot. Called before/after every content mutation. */
export async function snapshotRevision(entry: EntryLike, authorId: string | null) {
  const revisions = await db.cmsRevision.findMany({
    where: { entryId: entry.id },
    select: { revisionNumber: true },
  });
  return db.cmsRevision.create({
    data: {
      entryId: entry.id,
      revisionNumber: nextRevisionNumber(revisions),
      title: entry.title,
      summary: entry.summary,
      body: entry.body,
      seoTitle: entry.seoTitle,
      seoDescription: entry.seoDescription,
      status: entry.status,
      authorId: authorId ?? entry.authorId,
    },
  });
}

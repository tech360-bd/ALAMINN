/**
 * Public rendering of CMS content that is actually published in the database.
 * Drafts, review copies and archived entries return 404.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

async function loadPublished(slug: string) {
  return db.cmsEntry.findFirst({ where: { slug, status: "published" } });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = await loadPublished(slug);
  if (!entry) return { title: "Not found — Alaminn.info", robots: { index: false } };
  return {
    title: entry.seoTitle || entry.title,
    description: entry.seoDescription || entry.summary,
    alternates: { canonical: `/content/${entry.slug}` },
  };
}

export default async function PublishedContentPage({ params }: Props) {
  const { slug } = await params;
  const entry = await loadPublished(slug);
  if (!entry) notFound();

  let tags: string[] = [];
  try {
    const parsed = JSON.parse(entry.tags) as unknown;
    if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === "string");
  } catch { /* ignore malformed legacy tags */ }

  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <Link href="/" className="text-xs font-medium text-orange-600 hover:underline">← Back to alaminn.info</Link>
      <article className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">{entry.type}{entry.category ? ` · ${entry.category}` : ""}</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">{entry.title}</h1>
        {entry.summary && <p className="mt-4 text-base leading-relaxed text-ink-600">{entry.summary}</p>}
        {entry.publishedAt && <p className="mt-3 text-xs text-ink-500">Published {entry.publishedAt.toUTCString()}</p>}
        <div className="mt-8 whitespace-pre-wrap text-sm leading-7 text-ink-900">{entry.body}</div>
        {tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {tags.map((tag) => <span key={tag} className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{tag}</span>)}
          </div>
        )}
      </article>
    </main>
  );
}

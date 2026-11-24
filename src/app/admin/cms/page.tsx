"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, FileText, History, Loader2, RotateCcw, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, ErrorState } from "@/components/admin/page-primitives";
import { adminFetch } from "@/components/admin/lib";
import { cn } from "@/lib/utils";

type Entry = {
  id: string; slug: string; type: string; title: string; summary: string; body: string;
  category: string; tags: string; seoTitle: string | null; seoDescription: string | null;
  status: string; publishedAt: string | null; updatedAt: string;
};
type Revision = {
  id: string; revisionNumber: number; title: string; status: string; createdAt: string;
};

type CmsStatus = "draft" | "review" | "approved" | "published" | "archived";

export default function CmsPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [form, setForm] = useState({ slug: "", title: "", summary: "", body: "", category: "", tags: "", seoTitle: "", seoDescription: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const env = await adminFetch<{ entries: Entry[] }>("/api/v1/admin/cms/entries");
      setEntries(env.data.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load CMS entries.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void load(); });
    return () => { cancelled = true; };
  }, [load]);

  async function openEntry(id: string) {
    setActiveId(id);
    setError(null);
    try {
      const env = await adminFetch<{ entry: Entry; revisions: Revision[] }>(`/api/v1/admin/cms/entries/${id}`);
      const entry = env.data.entry;
      let tags = "";
      try { tags = (JSON.parse(entry.tags) as string[]).join(", "); } catch { tags = ""; }
      setForm({
        slug: entry.slug, title: entry.title, summary: entry.summary, body: entry.body,
        category: entry.category, tags, seoTitle: entry.seoTitle || "", seoDescription: entry.seoDescription || "",
      });
      setRevisions(env.data.revisions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open entry.");
    }
  }

  async function save() {
    if (!activeId) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/api/v1/admin/cms/entries/${activeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title, summary: form.summary, body: form.body, category: form.category,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
          seoTitle: form.seoTitle || null, seoDescription: form.seoDescription || null,
        }),
      });
      await openEntry(activeId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save draft.");
    } finally { setBusy(false); }
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const env = await adminFetch<{ entry: Entry }>("/api/v1/admin/cms/entries", {
        method: "POST",
        body: JSON.stringify({
          slug: form.slug, title: form.title || form.slug, type: "page", summary: form.summary,
          body: form.body, category: form.category,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
          seoTitle: form.seoTitle || undefined, seoDescription: form.seoDescription || undefined,
        }),
      });
      await load();
      await openEntry(env.data.entry.id);
      setForm((current) => ({ ...current, slug: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create draft.");
    } finally { setBusy(false); }
  }

  async function changeStatus(status: CmsStatus) {
    if (!activeId) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/api/v1/admin/cms/entries/${activeId}/status`, {
        method: "POST", body: JSON.stringify({ status }),
      });
      await openEntry(activeId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to change status.");
    } finally { setBusy(false); }
  }

  async function restore(revisionId: string) {
    if (!activeId) return;
    setBusy(true);
    try {
      await adminFetch(`/api/v1/admin/cms/entries/${activeId}/revisions/${revisionId}/restore`, { method: "POST" });
      await openEntry(activeId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to restore revision.");
    } finally { setBusy(false); }
  }

  const active = entries.find((entry) => entry.id === activeId);

  if (error && entries.length === 0) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader title="Website CMS" subtitle="Draft, review, approve and publish database-backed content" />
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-[75vh] overflow-y-auto">
          <CardHeader className="pb-2"><CardTitle className="text-base">Entries</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {entries.length === 0 && <p className="text-xs text-muted-foreground">No entries yet. Create a draft below.</p>}
            {entries.map((entry) => (
              <button key={entry.id} type="button" onClick={() => void openEntry(entry.id)}
                className={cn("block w-full rounded-lg border p-2 text-left", entry.id === activeId ? "border-orange-400 bg-orange-50/60" : "border-transparent hover:bg-muted/50")}>
                <span className="block truncate text-xs font-medium">{entry.title}</span>
                <span className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground"><Badge variant="outline">{entry.status}</Badge> /{entry.slug}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="h-[75vh] overflow-y-auto">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <CardTitle className="text-base">{active ? active.title : "New draft"}</CardTitle>
            {active && (
              <div className="flex flex-wrap gap-1.5">
                {active.status !== "published" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void save()}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Save</Button>}
                {active.status === "draft" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void changeStatus("review")}><Send className="mr-1 h-3.5 w-3.5" />Submit</Button>}
                {active.status === "review" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void changeStatus("approved")}>Approve</Button>}
                {active.status === "approved" && <Button size="sm" disabled={busy} onClick={() => void changeStatus("published")}>Publish</Button>}
                <Button size="sm" variant="outline" asChild><Link href={`/api/v1/admin/cms/entries/${active.id}/preview`} target="_blank" rel="noreferrer"><Eye className="mr-1 h-3.5 w-3.5" />Preview</Link></Button>
                {active.status === "published" && <Button size="sm" variant="outline" asChild><Link href={`/content/${active.slug}`} target="_blank"><Eye className="mr-1 h-3.5 w-3.5" />View live</Link></Button>}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">Slug
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} disabled={Boolean(active)} className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm" placeholder="my-page-slug" />
              </label>
              <label className="text-xs">Title
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm" />
              </label>
            </div>
            <label className="block text-xs">Summary
              <textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-xs">Body
              <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={12} className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">Category
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs">Tags (comma separated)
                <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs">SEO title
                <input value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs">SEO description
                <input value={form.seoDescription} onChange={(e) => setForm({ ...form, seoDescription: e.target.value })} className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm" />
              </label>
            </div>
            {!active && <Button onClick={() => void create()} disabled={busy || !form.slug}>{busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1 h-3.5 w-3.5" />}Create draft</Button>}

            {active && revisions.length > 0 && (
              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold"><History className="h-3.5 w-3.5" /> Revision history</p>
                <ul className="mt-2 space-y-1.5">
                  {revisions.slice(0, 10).map((revision) => (
                    <li key={revision.id} className="flex items-center gap-2 text-xs">
                      <span>v{revision.revisionNumber} · {revision.status} · {new Date(revision.createdAt).toLocaleString()}</span>
                      <button type="button" onClick={() => void restore(revision.id)} disabled={busy || active.status === "published"} className="ml-auto inline-flex items-center gap-1 text-orange-600 hover:underline disabled:opacity-40">
                        <RotateCcw className="h-3 w-3" />Restore
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

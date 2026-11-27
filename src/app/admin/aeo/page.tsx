"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { adminFetch, fmtDate } from "@/components/admin/lib";
import { Loader2, Plus, RefreshCw, Sparkles } from "lucide-react";

type ReadinessCheck = { id: string; label: string; status: "pass" | "warn" | "fail"; weight: number; evidence: string };
type Readiness = { score: number; checks: ReadinessCheck[]; summary: string; liveStats?: Record<string, number> };
type CheckRun = { id: string; status: string; engine: string; queries: number; citedCount: number; score: number; createdAt: string; finishedAt: string | null; checks?: Array<{ engine: string; query: string; cited: boolean; url: string | null; position: number | null }> };
type Gap = { id: string; topic: string; intent: string; ourCoverage: string; recommendation: string; status: string; score: number };

export default function AdminAeoPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [runs, setRuns] = useState<CheckRun[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [newGap, setNewGap] = useState({ topic: "", intent: "informational", ourCoverage: "none", recommendation: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [readinessJson, runsJson, gapsJson] = await Promise.all([
        adminFetch<Readiness>("/api/v1/admin/aeo/readiness"),
        adminFetch<CheckRun[]>("/api/v1/admin/aeo/checks?pageSize=20"),
        adminFetch<Gap[]>("/api/v1/admin/aeo/gaps?pageSize=50"),
      ]);
      setReadiness(readinessJson.data ?? null);
      setRuns(runsJson.data ?? []);
      setGaps(gapsJson.data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load AEO data.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function runCheck() {
    setBusy(true);
    try {
      const r = await adminFetch<{ citedCount: number; queries: number; score: number }>("/api/v1/admin/aeo/checks", {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast.success(`Citation check: cited in ${r.data?.citedCount}/${r.data?.queries} queries (score ${r.data?.score}).`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check failed.");
    } finally { setBusy(false); }
  }

  async function addGap() {
    if (!newGap.topic.trim()) { toast.error("Describe the topic first."); return; }
    setBusy(true);
    try {
      await adminFetch("/api/v1/admin/aeo/gaps", { method: "POST", body: JSON.stringify(newGap) });
      toast.success("Content gap recorded.");
      setNewGap({ topic: "", intent: "informational", ourCoverage: "none", recommendation: "" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally { setBusy(false); }
  }

  async function advanceGap(gap: Gap) {
    const next = gap.status === "open" ? "planned" : "covered";
    try {
      await adminFetch("/api/v1/admin/aeo/gaps", { method: "PUT", body: JSON.stringify({ id: gap.id, status: next }) });
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Update failed."); }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Sparkles className="h-6 w-6" /> AEO Engine</h1>
          <p className="text-sm text-muted-foreground">Answer-engine optimization: LLM-readiness audit, real citation tracking and content gaps.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </div>

      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <>
          <section className="space-y-3">
            <h2 className="font-medium">LLM-readiness audit (live database evidence)</h2>
            {readiness ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-semibold">{readiness.score}</div>
                  <div className="text-sm text-muted-foreground">{readiness.summary}</div>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground border-b">
                    <tr><th className="py-2">Check</th><th className="py-2">Status</th><th className="py-2">Evidence</th></tr>
                  </thead>
                  <tbody>
                    {readiness.checks.map((c) => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">{c.label}</td>
                        <td className="py-2"><Badge variant={c.status === "pass" ? "default" : c.status === "warn" ? "secondary" : "destructive"}>{c.status}</Badge></td>
                        <td className="py-2 text-xs text-muted-foreground">{c.evidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-muted-foreground">Readiness audit unavailable.</p>}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Citation checks (real provider runs only)</h2>
              <Button size="sm" onClick={() => void runCheck()} disabled={busy}>Run citation check</Button>
            </div>
            <p className="text-xs text-muted-foreground">Runs record honest results: without a configured provider (BRAVE_SEARCH_API_KEY env or integrations), the run is recorded as provider_unavailable — scores are never simulated. Weekly cron: /api/cron/aeo-weekly.</p>
            {runs.length === 0 ? <p className="text-sm text-muted-foreground">No citation runs yet.</p> : runs.map((run) => (
              <div key={run.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{run.engine}</span> · cited {run.citedCount}/{run.queries} (score {run.score})
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={run.status === "completed" ? "default" : run.status === "provider_unavailable" ? "secondary" : "destructive"}>{run.status}</Badge>
                    <span className="text-xs text-muted-foreground">{fmtDate(run.createdAt)}</span>
                  </div>
                </div>
                {run.checks && run.checks.length ? (
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {run.checks.map((c, i) => (
                      <li key={i}>{c.cited ? "✓" : "✗"} {c.query} {c.cited && c.url ? <span className="font-mono">→ {c.url}</span> : ""}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h2 className="font-medium">Content gaps</h2>
              {gaps.length === 0 ? <p className="text-sm text-muted-foreground">No content gaps recorded yet.</p> : gaps.map((g) => (
                <div key={g.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <div className="font-medium">{g.topic}</div>
                    <div className="text-xs text-muted-foreground">{g.intent} · coverage: {g.ourCoverage} · opportunity {g.score}{g.recommendation ? ` · ${g.recommendation}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={g.status === "open" ? "destructive" : g.status === "planned" ? "secondary" : "default"}>{g.status}</Badge>
                    {g.status !== "covered" ? <Button size="sm" variant="outline" onClick={() => void advanceGap(g)}>→ {g.status === "open" ? "planned" : "covered"}</Button> : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2 rounded-lg border p-4">
              <h2 className="font-medium">Record a gap</h2>
              <Input placeholder="Topic (e.g. 'cheapest universities in Germany for international students')" value={newGap.topic} onChange={(e) => setNewGap({ ...newGap, topic: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <select className="rounded border p-2 text-sm" value={newGap.intent} onChange={(e) => setNewGap({ ...newGap, intent: e.target.value })}>
                  {["informational", "commercial", "transactional"].map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
                <select className="rounded border p-2 text-sm" value={newGap.ourCoverage} onChange={(e) => setNewGap({ ...newGap, ourCoverage: e.target.value })}>
                  {["none", "partial", "full"].map((c) => <option key={c} value={c}>{c} coverage</option>)}
                </select>
              </div>
              <Input placeholder="Recommendation (optional)" value={newGap.recommendation} onChange={(e) => setNewGap({ ...newGap, recommendation: e.target.value })} />
              <Button size="sm" onClick={() => void addGap()} disabled={busy}><Plus className="h-3 w-3 mr-1" /> Record gap</Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

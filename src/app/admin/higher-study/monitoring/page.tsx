"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader, EmptyState } from "@/components/admin/page-primitives";
import { adminFetch, fmtDate } from "@/components/admin/lib";
import { toast } from "sonner";

type Change = { id: string; changeType: string; impact: string; entityLabel: string | null; field: string | null; oldValue: string | null; newValue: string | null; sourceUrl: string | null; confidence: number; aiSummary: string | null; status: string; detectedAt: string };
type Data = { widget: { lastCheck: string | null; nextCheck: string | null; universities: number; courses: number; sources: number; pendingApproval: number; critical: number; failedSources: number; status: string }; recentChanges: Change[] };

export default function MonitoringPage() {
  const [d, setD] = useState<Data | null>(null); const [, setLoading] = useState(false);
  const [src, setSrc] = useState({ url: "", sourceType: "university-course", owner: "" });
  async function load() { setLoading(true); try { const e = await adminFetch<Data>("/api/v1/higher-study/admin/monitoring"); setD(e.data); } catch { toast.error("Failed to load monitoring"); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function act(id: string, action: string) { try { await adminFetch(`/api/v1/higher-study/admin/monitoring/changes/${id}`, { method: "POST", body: JSON.stringify({ action }) }); toast.success(`${action} recorded — production data only changes on approve of an allow-listed field.`); load(); } catch (e) { toast.error(String(e)); } }
  async function addSource(e: React.FormEvent) { e.preventDefault(); try { await adminFetch("/api/v1/higher-study/admin/monitoring", { method: "POST", body: JSON.stringify(src) }); toast.success("Official source registered for weekly monitoring."); setSrc({ url: "", sourceType: "university-course", owner: "" }); load(); } catch (err) { toast.error(String(err)); } }
  if (!d) return <div className="p-6 text-sm text-muted-foreground">Loading University Data Monitor…</div>;
  const w = d.widget;
  return (<div className="p-6"><PageHeader title="University & Course Monitoring" subtitle="ALO University & Official Data Monitoring Agent — checks official sources every 7 days (cron: /api/cron/higher-study-monitor). AI detects and explains; only Super Admin approval updates production data." />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {[["Status", w.status], ["Last check", w.lastCheck ? fmtDate(w.lastCheck) : "never run"], ["Next check", w.nextCheck ? fmtDate(w.nextCheck) : "—"], ["Universities / Courses", `${w.universities} / ${w.courses}`], ["Official sources", String(w.sources)], ["Pending approval", String(w.pendingApproval)], ["Critical", String(w.critical)], ["Failed sources", String(w.failedSources)]].map(([k, v]) => <Card key={k}><CardHeader><CardTitle className="text-sm text-muted-foreground">{k}</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{v}</p></CardContent></Card>)}
    </div>
    <Card className="mb-6"><CardHeader><CardTitle>Register official source (government / immigration / university)</CardTitle></CardHeader><CardContent><form onSubmit={addSource} className="flex gap-2 flex-wrap"><Input className="min-w-80" placeholder="https://www.gov.uk/… or official course URL" value={src.url} onChange={(e) => setSrc({ ...src, url: e.target.value })} required /><Input placeholder="Type: government | immigration | university-course" value={src.sourceType} onChange={(e) => setSrc({ ...src, sourceType: e.target.value })} /><Input placeholder="Owner e.g. UKVI" value={src.owner} onChange={(e) => setSrc({ ...src, owner: e.target.value })} /><Button type="submit">Register</Button></form>
    <p className="text-xs text-muted-foreground mt-2">Catalogue records with an official source URL are auto-registered each run. Counts above are real database counts — courses are never generated to reach a target.</p></CardContent></Card>
    <Card><CardHeader><CardTitle>Verification Queue</CardTitle></CardHeader><CardContent>
      {d.recentChanges.map((c) => <div key={c.id} className="border-b py-3 text-sm"><div className="flex gap-2 flex-wrap"><strong>{c.entityLabel || c.changeType}</strong><Badge>{c.changeType}</Badge><Badge variant={c.impact === "CRITICAL" || c.impact === "HIGH" ? "destructive" : "outline"}>{c.impact}</Badge><Badge variant="secondary">{c.status}</Badge><span>confidence {Math.round(c.confidence * 100)}%</span><span className="text-muted-foreground">{fmtDate(c.detectedAt)}</span></div>
        <p className="mt-1"><span className="text-muted-foreground">Old:</span> {c.oldValue?.slice(0, 200) || "—"} → <span className="text-muted-foreground">New:</span> {c.newValue?.slice(0, 200) || "—"}</p>
        {c.aiSummary && <p className="text-muted-foreground">{c.aiSummary}</p>}
        <div className="flex gap-2 mt-2 flex-wrap">{c.sourceUrl && <a className="underline" href={c.sourceUrl} target="_blank" rel="noreferrer">View source</a>}
        {(c.status === "pending" || c.status === "needs-review") && <><Button size="sm" onClick={() => act(c.id, "approve")}>Approve</Button><Button size="sm" variant="outline" onClick={() => act(c.id, "reject")}>Reject</Button><Button size="sm" variant="outline" onClick={() => act(c.id, "recheck")}>Request recheck</Button><Button size="sm" variant="outline" onClick={() => act(c.id, "mark-verified")}>Mark verified</Button></>}</div></div>)}
      {d.recentChanges.length === 0 && <EmptyState message="No changes detected yet. Run the weekly cron or wait for the first cycle — an empty queue is a valid result, not missing data." />}
    </CardContent></Card></div>);
}

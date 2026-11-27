"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/page-primitives";
import { adminFetch, fmtDate } from "@/components/admin/lib";
import { toast } from "sonner";

type SourceOrg = { id: string; key: string; name: string; level: string; baseUrl: string | null; permissionState: string; permissionNote: string | null; robotsCheckedAt: string | null; active: boolean };
type Job = { id: string; sourceUrl: string; status: string; robotsAllowed: boolean; httpStatus: number | null; error: string | null; startedAt: string; completedAt: string | null; nextRetryAt: string | null; evidenceCreated: number; evidenceUpdated: number; conflictsDetected: number };
type Task = { id: string; type: string; refType: string; refId: string; title: string; detail: string | null; priority: string; status: string; createdAt: string };
type ConflictRow = { id: string; entityType: string; entityId: string; field: string; status: string; detectedAt: string; candidates: string };
type DuplicateRow = { id: string; entityType: string; similarityScore: number; matchReason: string | null; status: string; detectedAt: string };
type Dashboard = {
  sources: SourceOrg[];
  jobs: { failed: number; skippedPermissions: number; recent: Job[] };
  evidence: { byStatus: Record<string, number>; total: number };
  queues: { conflicts: number; duplicates: number; reviewTasks: number; byType: Record<string, number> };
  lastRun: { id: string; status: string; startedAt: string; completedAt: string | null; nextRunAt: string | null } | null;
};

const LEVEL_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = { L1_OFFICIAL: "default", L2_DISCOVERY: "secondary", L3_CREDIBLE: "outline" };

export default function IntelligencePage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateRow[]>([]);
  const [margeUrl, setMargeUrl] = useState("");

  async function load() {
    try {
      const [dash, t, c, dup] = await Promise.all([
        adminFetch<Dashboard>("/api/v1/higher-study/admin/intelligence"),
        adminFetch<{ tasks: Task[] }>("/api/v1/higher-study/admin/intelligence/tasks"),
        adminFetch<{ conflicts: ConflictRow[] }>("/api/v1/higher-study/admin/intelligence/conflicts"),
        adminFetch<{ duplicates: DuplicateRow[] }>("/api/v1/higher-study/admin/intelligence/duplicates"),
      ]);
      setD(dash.data); setTasks(t.data.tasks); setConflicts(c.data.conflicts); setDuplicates(dup.data.duplicates);
    } catch { toast.error("Failed to load intelligence dashboard"); }
  }
  useEffect(() => { load(); }, []);
  async function retryJob(job: Job) {
    try {
      const r = await adminFetch<{ status: string }>("/api/v1/higher-study/admin/intelligence/jobs", { method: "POST", body: JSON.stringify({ jobId: job.id }) });
      toast.success(`Retry: ${r.data.status}`); load();
    } catch (e) { toast.error(String(e)); }
  }
  async function resolve(conflictId: string, chosenSourceUrl: string) {
    const reason = window.prompt("Resolution reason (recorded in the audit log):");
    if (!reason) return;
    try {
      await adminFetch("/api/v1/higher-study/admin/intelligence/conflicts", { method: "POST", body: JSON.stringify({ id: conflictId, chosenSourceUrl, reason }) });
      toast.success("Conflict resolved by human decision — all candidates stay on record."); load();
    } catch (e) { toast.error(String(e)); }
  }
  async function decideDuplicate(id: string, decision: "merged" | "dismissed" | "false-positive") {
    try {
      await adminFetch("/api/v1/higher-study/admin/intelligence/duplicates", { method: "PATCH", body: JSON.stringify({ id, decision }) });
      toast.success(`Duplicate marked ${decision}.`); load();
    } catch (e) { toast.error(String(e)); }
  }
  async function saveMarge(e: React.FormEvent) {
    e.preventDefault();
    if (!margeUrl.startsWith("https://")) { toast.error("MARGE source URL must be https"); return; }
    try {
      await adminFetch("/api/v1/higher-study/admin/intelligence/sources", { method: "POST", body: JSON.stringify({ key: "marge", name: "MARGE", level: "L2_DISCOVERY", baseUrl: margeUrl, permissionNote: "URL confirmed by operator. robots.txt checked on save; collection stays disabled until permissionState is allowed.", active: false, robotsRecheck: true }) });
      toast.success("MARGE URL recorded + robots.txt checked. Enable collection only if allowed."); setMargeUrl(""); load();
    } catch (err) { toast.error(String(err)); }
  }

  if (!d) return <div className="p-6 text-sm text-muted-foreground">Loading University & Course Intelligence…</div>;
  const q = d.queues;
  return (
    <div className="p-6">
      <PageHeader title="University & Course Intelligence" subtitle="Live intelligence system — Level 2 platforms (ApplyBoard Assist, Edvoy, AHZ, IDP, MARGE) discover; Level 1 official sources verify. Conflicts, duplicates and unverified facts enter human review — nothing is auto-published. Weekly cycle: /api/cron/university-intelligence." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[["Evidence records", String(d.evidence.total)], ["Open conflicts", String(q.conflicts)], ["Open duplicates", String(q.duplicates)], ["Review tasks", String(q.reviewTasks)], ["Failed jobs", String(d.jobs.failed)], ["Skipped (permissions)", String(d.jobs.skippedPermissions)], ["Last cycle", d.lastRun ? fmtDate(d.lastRun.startedAt) : "never"], ["Next cycle", d.lastRun?.nextRunAt ? fmtDate(d.lastRun.nextRunAt) : "—"]].map(([k, v]) => (
          <Card key={k}><CardHeader><CardTitle className="text-sm text-muted-foreground">{k}</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{v}</p></CardContent></Card>
        ))}
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Documented sources ({d.sources.length})</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          {d.sources.map((s) => (
            <div key={s.id} className="border-b py-2">
              <div className="flex gap-2 flex-wrap items-center">
                <Badge variant={LEVEL_BADGE[s.level] ?? "outline"}>{s.level}</Badge>
                <strong>{s.name}</strong>
                <Badge variant={s.permissionState === "allowed" ? "default" : s.permissionState === "restricted" ? "destructive" : "secondary"}>robots: {s.permissionState}</Badge>
                {!s.active && <Badge variant="outline">collection disabled</Badge>}
                {s.baseUrl && <a className="underline text-muted-foreground" href={s.baseUrl} target="_blank" rel="noreferrer">{s.baseUrl}</a>}
              </div>
              {s.permissionNote && <p className="text-xs text-muted-foreground mt-1">{s.permissionNote}{s.robotsCheckedAt ? ` · checked ${fmtDate(s.robotsCheckedAt)}` : ""}</p>}
            </div>
          ))}
          <form onSubmit={saveMarge} className="flex gap-2 flex-wrap pt-2">
            <input className="border rounded px-2 py-1 text-sm min-w-80" placeholder="Confirm MARGE source URL (https://…)" value={margeUrl} onChange={(e) => setMargeUrl(e.target.value)} />
            <Button type="submit" variant="outline">Confirm MARGE URL</Button>
          </form>
          <p className="text-xs text-muted-foreground">MARGE is registered with its URL to be confirmed; its collection stays disabled until the URL and robots.txt state are confirmed by a human.</p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Human review queue ({tasks.length})</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          {tasks.length === 0 && <p className="text-muted-foreground">No open review tasks.</p>}
          {tasks.map((t) => (
            <div key={t.id} className="border-b py-2">
              <div className="flex gap-2 flex-wrap items-center">
                <Badge variant={t.priority === "CRITICAL" || t.priority === "HIGH" ? "destructive" : "secondary"}>{t.priority}</Badge>
                <Badge variant="outline">{t.type}</Badge>
                <strong>{t.title}</strong>
                <span className="text-muted-foreground">{fmtDate(t.createdAt)}</span>
              </div>
              {t.detail && <p className="text-xs text-muted-foreground mt-1">{t.detail}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Conflicts — every candidate preserved ({conflicts.length})</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-3">
          {conflicts.length === 0 && <p className="text-muted-foreground">No open conflicts.</p>}
          {conflicts.map((c) => {
            let candidates: { value: string; sourceUrl: string; sourceLevel: string; sourceOrgKey: string | null }[] = [];
            try { candidates = JSON.parse(c.candidates); } catch { candidates = []; }
            return (
              <div key={c.id} className="border-b py-2">
                <div className="flex gap-2 flex-wrap items-center"><Badge variant="destructive">CONFLICT</Badge><strong>{c.entityType} · {c.field}</strong><span className="text-muted-foreground">detected {fmtDate(c.detectedAt)}</span></div>
                <ul className="mt-2 space-y-1">
                  {candidates.map((cand, i) => (
                    <li key={i} className="flex gap-2 items-start flex-wrap">
                      <Badge variant={cand.sourceLevel === "L1_OFFICIAL" ? "default" : "secondary"}>{cand.sourceLevel}</Badge>
                      <span className="max-w-xl">{cand.value.slice(0, 160)}</span>
                      <a className="underline text-xs" href={cand.sourceUrl} target="_blank" rel="noreferrer">source</a>
                      <Button size="sm" variant="outline" onClick={() => resolve(c.id, cand.sourceUrl)}>Choose this</Button>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-1">A human chooses; the system never selects a value automatically. All candidates stay on record.</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Duplicate candidates ({duplicates.length})</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          {duplicates.length === 0 && <p className="text-muted-foreground">No open duplicate flags.</p>}
          {duplicates.map((dup) => (
            <div key={dup.id} className="border-b py-2 flex gap-2 flex-wrap items-center">
              <Badge variant="outline">{dup.entityType}</Badge>
              <span>similarity {dup.similarityScore.toFixed(2)} · {dup.matchReason}</span>
              <span className="text-muted-foreground">{fmtDate(dup.detectedAt)}</span>
              <Button size="sm" variant="outline" onClick={() => decideDuplicate(dup.id, "merged")}>Merged</Button>
              <Button size="sm" variant="outline" onClick={() => decideDuplicate(dup.id, "dismissed")}>Dismiss</Button>
              <Button size="sm" variant="outline" onClick={() => decideDuplicate(dup.id, "false-positive")}>False positive</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Collection jobs — recent ({d.jobs.recent.length})</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          {d.jobs.recent.map((j) => (
            <div key={j.id} className="border-b py-2 flex gap-2 flex-wrap items-center">
              <Badge variant={j.status === "ok" ? "default" : j.status === "failed" ? "destructive" : "secondary"}>{j.status}</Badge>
              <a className="underline text-xs max-w-md truncate" href={j.sourceUrl} target="_blank" rel="noreferrer">{j.sourceUrl}</a>
              <span className="text-muted-foreground">{fmtDate(j.startedAt)}</span>
              {j.status === "failed" && <><span className="text-destructive text-xs">{j.error?.slice(0, 120)}</span>{j.nextRetryAt && <span className="text-xs">retry after {fmtDate(j.nextRetryAt)}</span>}<Button size="sm" variant="outline" onClick={() => retryJob(j)}>Retry now</Button></>}
              {j.status === "skipped-permissions" && <span className="text-xs text-muted-foreground">robots.txt disallows or is unreachable — never bypassed</span>}
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <a href="/api/v1/higher-study/admin/intelligence/export?format=csv" className="underline text-sm" download>Bulk export evidence (CSV, full source attribution)</a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, History, Download, Upload, RefreshCw, CheckCircle2, XCircle, EyeOff, ShieldQuestion } from "lucide-react";
import { fmtDate } from "@/components/uci/shared";

interface QueueRecord {
  id: string; context: string | null; fieldsJson: string; sourceFile: string;
  sheet: string; rowNumber: number; sourceUrl: string | null; verificationStatus: string;
  collectedAt: string; lastCheckedAt: string | null; lastVerifiedAt: string | null;
  institution: { canonicalName: string; country: string; priorityCohort: boolean };
}
interface Conflict {
  institutionName: string; field: string; family: string;
  variants: { value: string; locations: string[]; recordIds: string[] }[];
}
interface Job {
  id: string; sourceKey: string; targetUrl: string; type: string; status: string;
  httpStatus: number | null; bytes: number | null; findings: string | null; lastError: string | null;
  scheduledAt: string; finishedAt: string | null;
}
interface AuditLog {
  id: string; actor: string; action: string; entity: string; entityId: string; detail: string | null; createdAt: string;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  VERIFY: <CheckCircle2 className="h-3.5 w-3.5" />,
  FLAG_CONFLICT: <AlertTriangle className="h-3.5 w-3.5" />,
  HUMAN_REVIEW: <ShieldQuestion className="h-3.5 w-3.5" />,
  RETIRE: <EyeOff className="h-3.5 w-3.5" />,
};

export function AdminView() {
  const { toast } = useToast();
  const [status, setStatus] = useState("SOURCE_CHECK_REQUIRED");
  const [queue, setQueue] = useState<{ total: number; items: QueueRecord[]; statusCounts: Record<string, number>; statuses: string[] } | null>(null);
  const [quality, setQuality] = useState<{
    conflicts: Conflict[]; duplicates: { institutionName: string; country: string; sheets: string[]; recordCount: number; programmeCount: number }[];
    outdated: { recordId: string; institutionName: string; context: string | null; family: string; supersededBy: string }[];
    summary: { conflictCount: number; duplicateCount: number; outdatedCount: number; institutionsWithOfficialUrl: number };
  } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ rec: QueueRecord; action: string } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [importCsv, setImportCsv] = useState("");
  const [importEntity, setImportEntity] = useState("institutions");

  const loadAll = useCallback(async () => {
    const [q, ql, j, a] = await Promise.all([
      fetch(`/api/uci/admin/queue?status=${status}&pageSize=15`).then((r) => r.json()),
      fetch("/api/uci/admin/quality").then((r) => r.json()),
      fetch("/api/uci/jobs").then((r) => r.json()),
      fetch("/api/uci/audit").then((r) => r.json()),
    ]);
    setQueue(q); setQuality(ql); setJobs(j.jobs); setLogs(a.logs);
    setBusy(false);
  }, [status]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/uci/admin/queue?status=${status}&pageSize=15`).then((r) => r.json()),
      fetch("/api/uci/admin/quality").then((r) => r.json()),
      fetch("/api/uci/jobs").then((r) => r.json()),
      fetch("/api/uci/audit").then((r) => r.json()),
    ]).then(([q, ql, j, a]) => {
      if (!active) return;
      setQueue(q); setQuality(ql); setJobs(j.jobs); setLogs(a.logs);
      setBusy(false);
    }).catch(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [status]);

  const doAction = async () => {
    if (!actionTarget) return;
    const res = await fetch("/api/uci/admin/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordId: actionTarget.rec.id, action: actionTarget.action, note: actionNote || undefined }),
    });
    const d = await res.json();
    if (d.error) toast({ title: "Action refused", description: d.error, variant: "destructive" });
    else toast({ title: `Record ${actionTarget.action}`, description: "Verification event and audit log recorded." });
    setActionTarget(null); setActionNote("");
    await loadAll();
  };

  const retireOutdated = async (recordId: string) => {
    const res = await fetch("/api/uci/admin/action", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordId, action: "RETIRE", note: "Superseded by a newer intake-year record; retired from publication queue after review." }),
    });
    const d = await res.json();
    if (d.error) toast({ title: "Action refused", description: d.error, variant: "destructive" });
    else toast({ title: "Outdated record retired" });
    await loadAll();
  };

  const runImport = async () => {
    if (!importCsv.trim()) { toast({ title: "Paste CSV content first", variant: "destructive" }); return; }
    const res = await fetch("/api/uci/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: importEntity, csv: importCsv }),
    });
    const d = await res.json();
    if (d.error) { toast({ title: "Import failed", description: d.error, variant: "destructive" }); return; }
    toast({ title: "Import finished", description: `${d.report.imported} imported · ${d.report.skipped_duplicates} duplicates blocked · ${d.report.skipped_invalid} invalid` });
    setImportCsv("");
    await loadAll();
  };

  const download = (entity: string) => { window.location.href = `/api/uci/export?entity=${entity}`; };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Nothing publishes automatically: records move forward only through recorded human decisions, and every decision writes an audit event.
        </p>
        <Button size="sm" variant="outline" onClick={loadAll} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
        </Button>
      </div>

      <Tabs defaultValue="queue">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="queue">Verification queue</TabsTrigger>
          <TabsTrigger value="conflicts">Conflicts ({quality?.summary?.conflictCount ?? "…"})</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicates ({quality?.summary?.duplicateCount ?? "…"})</TabsTrigger>
          <TabsTrigger value="outdated">Outdated ({quality?.summary?.outdatedCount ?? "…"})</TabsTrigger>
          <TabsTrigger value="jobs">Collection jobs</TabsTrigger>
          <TabsTrigger value="data">Export / Import</TabsTrigger>
          <TabsTrigger value="logs">Audit log</TabsTrigger>
        </TabsList>

        {/* ── Verification queue ── */}
        <TabsContent value="queue" className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {(queue?.statuses ?? []).map((s) => (
              <Button key={s} size="sm" variant={status === s ? "default" : "outline"}
                style={status === s ? { backgroundColor: "#E8501A" } : {}}
                onClick={() => setStatus(s)} className="text-xs">
                {s.replaceAll("_", " ").toLowerCase()} ({queue?.statusCounts?.[s] ?? 0})
              </Button>
            ))}
          </div>
          {(queue?.items ?? []).map((r) => {
            const fields = JSON.parse(r.fieldsJson || "{}") as Record<string, string>;
            return (
              <Card key={r.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">{r.institution.canonicalName}
                      {r.institution.priorityCohort && <Badge className="ml-2 text-[10px]" style={{ backgroundColor: "#0066CC" }}>P27</Badge>}
                      {r.context && <Badge variant="secondary" className="ml-1 text-[10px]">{r.context}</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      {r.verificationStatus === "OFFICIAL_SOURCE_VERIFIED" && (
                        <Button size="sm" style={{ backgroundColor: "#2f9e44" }} className="text-white text-xs h-7"
                          onClick={() => setActionTarget({ rec: r, action: "APPROVE" })}>
                          Approve for publication
                        </Button>
                      )}
                      {(["VERIFY", "FLAG_CONFLICT", "HUMAN_REVIEW", "RETIRE"] as const).map((a) => (
                        <Button key={a} size="sm" variant="outline" className="text-xs h-7"
                          onClick={() => setActionTarget({ rec: r, action: a })}>
                          {ACTION_ICONS[a]} {a.replaceAll("_", " ").toLowerCase()}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                    {Object.entries(fields).slice(0, 12).map(([k, v]) => (
                      <div key={k} className="truncate"><span className="text-muted-foreground">{k}:</span> {String(v).slice(0, 60)}</div>
                    ))}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
                    <span className="font-mono">{r.sourceFile}::{r.sheet}:row{r.rowNumber}</span>
                    <span>collected {fmtDate(r.collectedAt)}</span>
                    <span>checked {fmtDate(r.lastCheckedAt)}</span>
                    <span>verified {fmtDate(r.lastVerifiedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!busy && (queue?.items?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">No records with this status.</p>
          )}
        </TabsContent>

        {/* ── Conflicts ── */}
        <TabsContent value="conflicts" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Same institution, same field, same intake family — differing recorded values. Every variant is preserved with its location; nothing is auto-resolved.
          </p>
          {(quality?.conflicts ?? []).slice(0, 30).map((c, i) => (
            <Card key={i}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  {c.institutionName} — <span className="font-mono text-xs">{c.field}</span>
                  <Badge variant="secondary" className="text-[10px]">{c.family}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {c.variants.map((v, j) => (
                    <div key={j} className="rounded border p-2 text-xs space-y-1">
                      <p className="font-semibold text-red-800">{v.value}</p>
                      {v.locations.map((loc) => <p key={loc} className="font-mono text-muted-foreground text-[10px]">{loc}</p>)}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {!busy && (quality?.conflicts?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No conflicts detected.</p>}
        </TabsContent>

        {/* ── Duplicates ── */}
        <TabsContent value="duplicates" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Institutions captured in two or more source sheets under one canonical record. Cross-sheet records are kept — the duplicate detection is what prevents silent double counting.
          </p>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Institution</TableHead><TableHead>Country</TableHead><TableHead>Records</TableHead><TableHead>Programmes</TableHead><TableHead>Sheets</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(quality?.duplicates ?? []).map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{d.institutionName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{d.country}</TableCell>
                        <TableCell className="text-sm">{d.recordCount}</TableCell>
                        <TableCell className="text-sm">{d.programmeCount}</TableCell>
                        <TableCell className="text-[11px] font-mono text-muted-foreground">{d.sheets.join(" · ")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Outdated ── */}
        <TabsContent value="outdated" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Records from an older intake family while a newer one exists for the same institution. A human decides whether to retire the older record — no auto-deletion.
          </p>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Institution</TableHead><TableHead>Context</TableHead><TableHead>Family</TableHead><TableHead>Superseded by</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(quality?.outdated ?? []).slice(0, 80).map((o) => (
                      <TableRow key={o.recordId}>
                        <TableCell className="text-sm">{o.institutionName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{o.context ?? "—"}</TableCell>
                        <TableCell className="text-sm">{o.family}</TableCell>
                        <TableCell className="text-sm font-medium text-orange-700">{o.supersededBy}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => retireOutdated(o.recordId)}>
                            <XCircle className="h-3.5 w-3.5" /> Retire
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Jobs ── */}
        <TabsContent value="jobs" className="space-y-3">
          <p className="text-sm text-muted-foreground">Every scheduled or manual source check with its real outcome: HTTP status, content hash, bytes and failures. Failed jobs stay visible until resolved.</p>
          {jobs.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No collection jobs yet — run one from the Sources tab.</p>}
          {jobs.map((j) => (
            <Card key={j.id}>
              <CardContent className="p-3 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline" className={
                    j.status === "SUCCESS" ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                    j.status === "ROBOTS_BLOCKED" ? "bg-amber-50 text-amber-800 border-amber-200" :
                    j.status === "FAILED" ? "bg-red-50 text-red-800 border-red-200" : "bg-slate-100"}>
                    {j.status}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground font-mono break-all">{j.targetUrl}</span>
                </div>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                  <span>{j.sourceKey}</span>
                  {j.httpStatus && <span>HTTP {j.httpStatus}</span>}
                  {j.bytes && <span>{j.bytes} bytes</span>}
                  <span>{fmtDate(j.finishedAt ?? j.scheduledAt)}</span>
                </div>
                {j.findings && <p className="text-xs">{j.findings}</p>}
                {j.lastError && <p className="text-xs text-red-700">{j.lastError}</p>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── Export / Import ── */}
        <TabsContent value="data" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1"><Download className="h-4 w-4" /> Bulk export (CSV, with provenance)</h3>
              <p className="text-xs text-muted-foreground">Exports carry verification status, source file/sheet/row and timestamps so exported data can never be mistaken for verified data.</p>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => download("institutions")}>Institutions</Button>
                <Button size="sm" variant="outline" onClick={() => download("programmes")}>Programmes</Button>
                <Button size="sm" variant="outline" onClick={() => download("records")}>Requirement records (long form)</Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1"><Upload className="h-4 w-4" /> Validated import with duplicate protection</h3>
              <p className="text-xs text-muted-foreground">Imports always enter at SOURCE_CHECK_REQUIRED — imports can never publish anything.</p>
              <Select value={importEntity} onValueChange={setImportEntity}>
                <SelectTrigger aria-label="Import entity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="institutions">Institutions (needs canonical_name, country)</SelectItem>
                  <SelectItem value="programmes">Programmes (needs institution, program_name)</SelectItem>
                </SelectContent>
              </Select>
              <Textarea rows={6} placeholder={"canonical_name,country\nUniversity of Leicester,United Kingdom"} value={importCsv} onChange={(e) => setImportCsv(e.target.value)} className="font-mono text-xs" />
              <Button size="sm" style={{ backgroundColor: "#E8501A" }} className="text-white" onClick={runImport}>Validate & import</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Audit log ── */}
        <TabsContent value="logs" className="space-y-2">
          <p className="text-sm text-muted-foreground">Every verification, import, export and job creation is recorded. The log is append-only.</p>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {logs.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDate(l.createdAt)}</TableCell>
                        <TableCell className="text-xs">{l.actor}</TableCell>
                        <TableCell className="text-xs font-medium">{l.action}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{l.entity}</TableCell>
                        <TableCell className="text-[11px] font-mono text-muted-foreground break-all max-w-[420px]">{l.detail?.slice(0, 160) ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                    {logs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No audit entries yet.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* action confirmation dialog */}
      <Dialog open={!!actionTarget} onOpenChange={(o) => !o && setActionTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{actionTarget?.action.replaceAll("_", " ").toLowerCase()} — {actionTarget?.rec.institution.canonicalName}</DialogTitle>
            <DialogDescription>
              {actionTarget?.action === "APPROVE" && "Approval moves this record into the publication set. It is only possible after a recorded official-source verification."}
              {actionTarget?.action === "VERIFY" && "Mark this record as verified against its official source. The verification date is recorded on the record."}
              {actionTarget?.action === "FLAG_CONFLICT" && "Flags the record as conflicting so it enters human review and is excluded from publication."}
              {actionTarget?.action === "HUMAN_REVIEW" && "Assigns the record to the human review queue."}
              {actionTarget?.action === "RETIRE" && "Retires the record from the publication queue. The record is preserved, never deleted."}
              {actionTarget?.rec.context && <span className="block mt-1 font-mono text-[11px]">{actionTarget.rec.sourceFile}::{actionTarget.rec.sheet}:row{actionTarget.rec.rowNumber} · {actionTarget.rec.context}</span>}
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={3} placeholder="Reviewer note (recorded in the audit trail)…" value={actionNote} onChange={(e) => setActionNote(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionTarget(null)}>Cancel</Button>
            <Button style={{ backgroundColor: "#E8501A" }} className="text-white" onClick={doAction}>
              <History className="h-4 w-4 mr-1" /> Confirm & record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

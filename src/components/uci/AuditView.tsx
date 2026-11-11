"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, FileSpreadsheet, AlertTriangle, ArrowRight } from "lucide-react";
import { fmtDate } from "@/components/uci/shared";

interface Phase1 {
  extracted_at: string;
  source_files: { key: string; file: string; role: string }[];
  summary: { unique_institutions: number; total_requirement_records: number; total_programme_records: number; conflicting_information: number; priority27_with_existing_data: number; countries: string[]; official_urls_found: number };
  issues: { type: string; university?: string; field?: string; sheet_family?: string; detail?: string; scope?: string; variants?: { value: string; locations: string[] }[] }[];
  priority27_coverage: { university: string; present_in_existing_data: boolean; ambiguous_namesake_note?: string | null; record_count: number; sheets: string[] }[];
}

const ISSUE_LABEL: Record<string, string> = {
  CONFLICTING_INFORMATION: "Conflicting values",
  MULTI_SHEET_DUPLICATE: "Cross-sheet duplicate",
  AMBIGUOUS_INSTITUTION_NAME: "Ambiguous institution name",
  MISSING_DATA_GAP: "Missing data gap",
};

export function AuditView() {
  const [p1, setP1] = useState<Phase1 | null>(null);
  useEffect(() => {
    fetch("/api/uci/audit").then((r) => r.json()).then((d) => setP1(d.phase1));
  }, []);

  if (!p1) return <p className="text-sm text-muted-foreground py-8 text-center">Loading Phase-1 audit…</p>;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-4 space-y-1">
          <h3 className="text-sm font-semibold flex items-center gap-1"><ClipboardList className="h-4 w-4" style={{ color: "#E8501A" }} /> Phase 1 — Existing-data audit (completed before any implementation)</h3>
          <p className="text-xs text-muted-foreground">Extracted {fmtDate(p1.extracted_at)} from the four ALO Education operational spreadsheets supplied for this module. Nothing was bulk-replaced: the audit is the basis of the migration plan below.</p>
        </CardContent>
      </Card>

      {/* inventory */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: "Institutions", value: p1.summary?.unique_institutions },
          { label: "Requirement records", value: p1.summary?.total_requirement_records },
          { label: "Programme records", value: p1.summary?.total_programme_records },
          { label: "Conflicting values", value: p1.summary?.conflicting_information },
          { label: "Priority 27 covered", value: `${p1.summary?.priority27_with_existing_data}/27` },
          { label: "Official URLs found", value: p1.summary?.official_urls_found },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold" style={{ color: "#E8501A" }}>{s.value}</p>
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* source files */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-1"><FileSpreadsheet className="h-4 w-4" /> Audited source files</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {p1.source_files.map((f) => (
            <Card key={f.key}><CardContent className="p-3">
              <p className="text-sm font-medium">{f.file}</p>
              <p className="text-xs text-muted-foreground">{f.role}</p>
            </CardContent></Card>
          ))}
        </div>
      </div>

      {/* priority 27 */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Priority-27 coverage in existing data</h3>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead>University</TableHead><TableHead>In existing data</TableHead><TableHead>Records</TableHead><TableHead>Sheets</TableHead></TableRow></TableHeader>
                <TableBody>
                  {p1.priority27_coverage.map((c) => (
                    <TableRow key={c.university}>
                      <TableCell className="text-sm">{c.university}</TableCell>
                      <TableCell>
                        {c.present_in_existing_data
                          ? <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200" variant="outline">yes</Badge>
                          : c.ambiguous_namesake_note
                            ? <Badge className="bg-amber-50 text-amber-800 border-amber-200" variant="outline">namesake only</Badge>
                            : <Badge variant="outline">gap — needs discovery</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">{c.record_count}</TableCell>
                      <TableCell className="text-[11px] font-mono text-muted-foreground">{c.sheets.slice(0, 3).join(" · ") || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        {p1.priority27_coverage.some((c) => c.ambiguous_namesake_note) && (
          <p className="text-xs text-muted-foreground">
            {p1.priority27_coverage.find((c) => c.ambiguous_namesake_note)?.ambiguous_namesake_note}
          </p>
        )}
      </div>

      {/* issues */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-red-600" /> Audit findings ({p1.issues.length})</h3>
        <div className="space-y-2 max-h-[320px] overflow-y-auto">
          {p1.issues.slice(0, 40).map((i, idx) => (
            <Card key={idx}><CardContent className="p-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={i.type === "CONFLICTING_INFORMATION" ? "bg-red-50 text-red-800 border-red-200" : "bg-slate-100"}>{ISSUE_LABEL[i.type] ?? i.type}</Badge>
                {i.university && <span className="text-sm font-medium">{i.university}</span>}
                {i.field && <span className="text-xs font-mono text-muted-foreground">{i.field}</span>}
                {i.sheet_family && <Badge variant="secondary" className="text-[10px]">{i.sheet_family}</Badge>}
              </div>
              {i.detail && <p className="text-xs text-muted-foreground">{i.detail}</p>}
              {i.scope && <p className="text-xs text-muted-foreground">{i.scope}</p>}
              {i.variants && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {i.variants.map((v, j) => (
                    <p key={j} className="text-xs"><span className="font-semibold text-red-800">{v.value}</span> <span className="font-mono text-[10px] text-muted-foreground">({v.locations[0]})</span></p>
                  ))}
                </div>
              )}
            </CardContent></Card>
          ))}
        </div>
      </div>

      {/* migration & enrichment plan */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Migration & enrichment plan (no bulk replacement)</h3>
        <Card><CardContent className="p-4 space-y-3 text-sm">
          <ol className="list-decimal list-inside space-y-2">
            <li><strong>Register, don&apos;t overwrite.</strong> All 236 institutions and 428 requirement records from the spreadsheets were imported as new provenance-tagged records at <span className="font-mono text-xs">SOURCE_CHECK_REQUIRED</span>. No existing production record is replaced or deleted by this module.</li>
            <li><strong>Canonical identity first.</strong> Name variants (e.g. &quot;Aston University - London Campus&quot;, &quot;Aston University- Birmingham&quot;) are preserved as-written and mapped to one canonical institution; ambiguous names (University of Lincoln) are flagged, not merged.</li>
            <li><strong>Resolve the 52 live conflicts by human review.</strong> Each conflict keeps every source variant side-by-side; a reviewer verifies against the official page and records the decision — the system never picks a value silently.</li>
            <li><strong>Retire superseded year records deliberately.</strong> 96 records from older intake families are queued for retirement after review, so the directory always shows the current intake while keeping history.</li>
            <li><strong>Close the priority-27 gaps.</strong> 13 of the 27 priority UK universities have no internal records; they are registered for discovery via Level-2 platforms and verification via Level-1 official pages.</li>
            <li><strong>Verify before publication.</strong> Only records moved to OFFICIAL_SOURCE_VERIFIED and then APPROVED_FOR_PUBLICATION appear as confirmed on student-facing pages; everything else shows its true status and last-checked date.</li>
            <li><strong>Enrich from official sources.</strong> The 4 official URLs already captured (LSBU, Chester ×2, Aberystwyth) anchor scheduled source checks; each verified institution gains its official course-page URLs, then fees, deadlines and English requirements are enriched field-by-field with evidence links.</li>
          </ol>
        </CardContent></Card>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ArrowRight className="h-3.5 w-3.5" /> Next enrichment target: connect remaining institutions to their official international-admissions pages through Level-2 discovery, then schedule monitored source checks.
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Search, GraduationCap, ExternalLink, BadgeCheck, MapPin, BookOpen, Landmark } from "lucide-react";
import { VerificationBadge, fieldLabel, fmtDate } from "@/components/uci/shared";

interface InstitutionCard {
  id: string; canonicalName: string; country: string; institutionType: string;
  priorityCohort: boolean; officialWebsite: string | null;
  recordCount: number; programmeCount: number;
  statuses: Record<string, number>; hasScholarship: boolean; englishTests: string[];
}

interface DetailRecord {
  id: string; context: string | null; fieldsJson: string; sourceFile: string;
  sheet: string; rowNumber: number; sourceUrl: string | null;
  verificationStatus: string; lastCheckedAt: string | null; lastVerifiedAt: string | null;
  collectedAt: string;
}

interface Detail {
  institution: {
    canonicalName: string; asWritten: string[]; country: string; cities: string[];
    institutionType: string; priorityCohort: boolean; officialWebsite: string | null;
  };
  records: DetailRecord[];
  programmes: { id: string; level: string | null; programName: string; duration: string | null; tuition: string | null }[];
  events: { id: string; action: string; fromStatus: string | null; toStatus: string | null; actor: string; note: string | null; createdAt: string }[];
}

const TYPE_LABEL: Record<string, string> = {
  UNIVERSITY: "University", COLLEGE: "College", INSTITUTE: "Institute",
  PATHWAY_PROVIDER: "Pathway provider", OTHER: "Institution", UNKNOWN: "Institution",
};

export function DirectoryView() {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("all");
  const [englishTest, setEnglishTest] = useState("all");
  const [scholarship, setScholarship] = useState(false);
  const [priority, setPriority] = useState(false);
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: InstitutionCard[]; countries: string[] } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), pageSize: "12" });
    if (q) params.set("q", q);
    if (country !== "all") params.set("country", country);
    if (englishTest !== "all") params.set("englishTest", englishTest);
    if (scholarship) params.set("scholarship", "1");
    if (priority) params.set("priority", "1");
    if (type !== "all") params.set("type", type);
    fetch(`/api/uci/institutions?${params}`)
      .then((res) => res.json())
      .then((json) => {
        if (!active) return;
        setData(json);
        setLoading(false);
      })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [q, country, englishTest, scholarship, priority, type, page]);

  const openDetail = async (name: string) => {
    setDetailLoading(true);
    const res = await fetch(`/api/uci/institutions/name?name=${encodeURIComponent(name)}`);
    const d = await res.json();
    setDetail(d);
    setDetailLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* filter bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input placeholder="Search university or college…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-8" aria-label="Search institutions" />
            </div>
            <Select value={country} onValueChange={(v) => { setCountry(v); setPage(1); }}>
              <SelectTrigger aria-label="Country"><SelectValue placeholder="Country" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                {(data?.countries ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
              <SelectTrigger aria-label="Institution type"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="UNIVERSITY">Universities</SelectItem>
                <SelectItem value="COLLEGE">Colleges</SelectItem>
                <SelectItem value="INSTITUTE">Institutes</SelectItem>
                <SelectItem value="PATHWAY_PROVIDER">Pathway providers</SelectItem>
              </SelectContent>
            </Select>
            <Select value={englishTest} onValueChange={(v) => { setEnglishTest(v); setPage(1); }}>
              <SelectTrigger aria-label="English test"><SelectValue placeholder="English test" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any English test</SelectItem>
                <SelectItem value="IELTS">IELTS</SelectItem>
                <SelectItem value="PTE">PTE</SelectItem>
                <SelectItem value="OIETC">OIETC</SelectItem>
                <SelectItem value="DUOLINGO">Duolingo</SelectItem>
                <SelectItem value="TOEFL">TOEFL</SelectItem>
                <SelectItem value="MOI">MOI route</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button variant={scholarship ? "default" : "outline"} size="sm" className="flex-1" onClick={() => { setScholarship(!scholarship); setPage(1); }}
                style={scholarship ? { backgroundColor: "#E8501A" } : {}}>
                Scholarship listed
              </Button>
              <Button variant={priority ? "default" : "outline"} size="sm" className="flex-1" onClick={() => { setPriority(!priority); setPage(1); }}
                style={priority ? { backgroundColor: "#0066CC" } : {}}>
                Priority 27
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* results */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="h-40 animate-pulse bg-muted" />)}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} institutions found · every figure below comes from recorded source files, unverified values stay flagged</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(data?.items ?? []).map((i) => (
              <Card key={i.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDetail(i.canonicalName)}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight text-sm">{i.canonicalName}</h3>
                    {i.priorityCohort && <Badge className="text-[10px] shrink-0" style={{ backgroundColor: "#0066CC" }}>P27</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{i.country}</span>
                    <span className="inline-flex items-center gap-1"><Landmark className="h-3 w-3" />{TYPE_LABEL[i.institutionType] ?? i.institutionType}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {i.englishTests.slice(0, 5).map((t) => <Badge key={t} variant="secondary" className="text-[10px] px-1.5">{t}</Badge>)}
                    {i.hasScholarship && <Badge className="text-[10px] px-1.5" style={{ backgroundColor: "#FFB347", color: "#3b2305" }}>Scholarship</Badge>}
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{i.recordCount} requirement records · {i.programmeCount} programmes</span>
                    <VerificationBadge
                      small
                      status={i.statuses.APPROVED_FOR_PUBLICATION ? "APPROVED_FOR_PUBLICATION" : i.statuses.OFFICIAL_SOURCE_VERIFIED ? "OFFICIAL_SOURCE_VERIFIED" : "SOURCE_CHECK_REQUIRED"}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {(data?.total ?? 0) > 12 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil((data?.total ?? 0) / 12)}</span>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil((data?.total ?? 0) / 12)} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </>
      )}

      {/* detail dialog */}
      <Dialog open={!!detail || detailLoading} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <GraduationCap className="h-5 w-5" style={{ color: "#E8501A" }} />
              {detail?.institution.canonicalName ?? "Loading…"}
            </DialogTitle>
            <DialogDescription>
              {detail && (
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span>{detail.institution.country}</span>
                  <span>{TYPE_LABEL[detail.institution.institutionType]}</span>
                  {detail.institution.cities.length > 0 && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{detail.institution.cities.slice(0, 3).join(", ")}</span>}
                  {detail.institution.priorityCohort && <Badge className="text-[10px]" style={{ backgroundColor: "#0066CC" }}>Priority 27 cohort</Badge>}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <ScrollArea className="flex-1 pr-3 -mr-3">
              <div className="space-y-5 pb-2">
                {/* institution facts */}
                <div className="rounded-lg border p-3 space-y-2">
                  <h4 className="text-sm font-semibold">Institution facts</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Official website:</span>{" "}
                      {detail.institution.officialWebsite ? (
                        <a className="text-[#0066CC] underline inline-flex items-center gap-1" href={detail.institution.officialWebsite} target="_blank" rel="noopener noreferrer">
                          {new URL(detail.institution.officialWebsite).hostname}<ExternalLink className="h-3 w-3" />
                        </a>
                      ) : <span className="text-muted-foreground">not captured yet</span>}
                    </div>
                    <div><span className="text-muted-foreground">Name variants in sources:</span> {detail.institution.asWritten.slice(0, 3).join(" · ") || "—"}</div>
                  </div>
                </div>

                {/* requirement records */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Requirement records ({detail.records.length}) — verbatim from recorded sources</h4>
                  {detail.records.map((r) => {
                    const fields = JSON.parse(r.fieldsJson || "{}") as Record<string, string>;
                    return (
                      <div key={r.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">
                            {r.context ? <Badge variant="secondary" className="text-[10px] mr-1">{r.context}</Badge> : null}
                            <span className="font-mono">{r.sourceFile}::{r.sheet}:row{r.rowNumber}</span>
                          </div>
                          <VerificationBadge small status={r.verificationStatus} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          {Object.entries(fields).map(([k, v]) => (
                            <div key={k} className="flex gap-1">
                              <span className="text-muted-foreground shrink-0">{fieldLabel(k)}:</span>
                              <span className="break-words">
                                {v.startsWith("http") ? (
                                  <a href={v} target="_blank" rel="noopener noreferrer" className="text-[#0066CC] underline break-all inline-flex items-center gap-0.5">
                                    source link<ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                ) : v}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
                          <span>Collected {fmtDate(r.collectedAt)}</span>
                          <span>Last checked {fmtDate(r.lastCheckedAt)}</span>
                          <span>Verified {fmtDate(r.lastVerifiedAt)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* programmes */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1"><BookOpen className="h-4 w-4" style={{ color: "#E8501A" }} /> Programmes ({detail.programmes.length})</h4>
                  {detail.programmes.length > 0 ? (
                    <Table>
                      <TableHeader><TableRow><TableHead>Programme</TableHead><TableHead>Level</TableHead><TableHead>Duration</TableHead><TableHead>Tuition</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {detail.programmes.slice(0, 100).map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-sm">{p.programName}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.level ?? "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.duration ?? "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.tuition ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : <p className="text-sm text-muted-foreground">No programme-level records captured yet for this institution.</p>}
                </div>

                {/* verification events */}
                {detail.events.length > 0 && (
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold">Verification history</h4>
                    {detail.events.slice(0, 10).map((e) => (
                      <p key={e.id} className="text-xs text-muted-foreground">
                        {fmtDate(e.createdAt)} — <span className="font-medium text-foreground">{e.action}</span> by {e.actor}
                        {e.note ? `: ${e.note}` : ""}
                      </p>
                    ))}
                  </div>
                )}

                {/* enquiry CTA */}
                <div className="rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between" style={{ backgroundColor: "#FFF3EB" }}>
                  <div className="text-sm">
                    <p className="font-medium">Planning to apply to {detail.institution.canonicalName}?</p>
                    <p className="text-muted-foreground text-xs">ALO Education counsellors verify every requirement with the official university source before you apply.</p>
                  </div>
                  <a href="https://alaminn.info" target="_blank" rel="noopener noreferrer">
                    <Button style={{ backgroundColor: "#E8501A" }} className="text-white">
                      <BadgeCheck className="h-4 w-4 mr-1" /> Enquire with ALO Education
                    </Button>
                  </a>
                </div>
              </div>
            </ScrollArea>
          )}
          {detailLoading && <p className="text-sm text-muted-foreground py-6 text-center">Loading verified record…</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

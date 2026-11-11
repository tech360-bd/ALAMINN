"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { VerificationBadge } from "@/components/uci/shared";

interface Programme {
  id: string; institutionName: string; country: string; level: string | null;
  programName: string; duration: string | null; tuition: string | null;
  verificationStatus: string; sourceFile: string; sheet: string; rowNumber: number;
  institution: { canonicalName: string; officialWebsite: string | null; priorityCohort: boolean } | null;
}

export function ProgrammeView() {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("all");
  const [level, setLevel] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: Programme[]; levels: string[]; countries: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (q) params.set("q", q);
    if (country !== "all") params.set("country", country);
    if (level !== "all") params.set("level", level);
    fetch(`/api/uci/programmes?${params}`)
      .then((res) => res.json())
      .then((json) => {
        if (!active) return;
        setData(json);
        setLoading(false);
      })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [q, country, level, page]);

  const totalPages = Math.ceil((data?.total ?? 0) / 25);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input placeholder="Search programmes (e.g. Nursing, MBA, Computer Science)…" value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-8" aria-label="Search programmes" />
          </div>
          <Select value={country} onValueChange={(v) => { setCountry(v); setPage(1); }}>
            <SelectTrigger aria-label="Country"><SelectValue placeholder="Country" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              {(data?.countries ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={level} onValueChange={(v) => { setLevel(v); setPage(1); }}>
            <SelectTrigger aria-label="Study level"><SelectValue placeholder="Level" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {(data?.levels ?? []).map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {data?.total ?? 0} programme records · fees and durations are captured verbatim with their source file — check the verification badge before relying on any figure
      </p>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Programme</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Tuition</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : (data?.items ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm font-medium">{p.programName}</TableCell>
                    <TableCell className="text-sm">{p.institutionName}{p.institution?.priorityCohort && <span className="ml-1 text-[10px] text-[#0066CC] font-semibold">P27</span>}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.country}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.level ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.duration ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.tuition ?? "—"}</TableCell>
                    <TableCell><VerificationBadge small status={p.verificationStatus} /></TableCell>
                  </TableRow>
                ))}
                {!loading && (data?.items?.length ?? 0) === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No programme records match your filters.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /> Previous</Button>
        <span className="text-sm text-muted-foreground">Page {page} of {Math.max(1, totalPages)}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

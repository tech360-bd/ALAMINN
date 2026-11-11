"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis,
} from "recharts";
import { ArrowLeft, BarChart3, Loader2 } from "lucide-react";
import { STATUS_STYLES } from "@/lib/uci/verification";

interface Stats {
  institutions: number; priorityCohort: number; universities: number; pathwayProviders: number;
  requirementRecords: number; programmes: number; conflictCount: number;
  recordsByStatus: Record<string, number>;
  programmesByStatus: Record<string, number>;
  byCountry: Record<string, { institutions: number; programmes: number }>;
  sources: { total: number; official: number; platform: number; public: number; internal: number; pendingIdentity: number };
  jobs: Record<string, number>;
}

export default function ReportsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/uci/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!stats) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Stats unavailable.</div>;

  const recordData = Object.entries(stats.recordsByStatus).map(([status, count]) => ({ status: status.replace(/_/g, " "), count }));
  const programmeData = Object.entries(stats.programmesByStatus).map(([status, count]) => ({ status: status.replace(/_/g, " "), count }));
  const countryData = Object.entries(stats.byCountry)
    .map(([country, v]) => ({ country, institutions: v.institutions, programmes: v.programmes }))
    .sort((a, b) => b.programmes - a.programmes);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b bg-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: "#0066CC" }}>
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <div className="flex-1">
            <h1 className="font-bold text-base leading-tight flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" style={{ color: "#0066CC" }} /> Reports &amp; analytics
            </h1>
            <p className="text-[11px] text-muted-foreground">Live aggregates computed from the database on every request — never cached snapshots.</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "institutions", value: stats.institutions },
            { label: "programmes", value: stats.programmes },
            { label: "source records", value: stats.requirementRecords },
            { label: "conflicts", value: stats.conflictCount },
            { label: "collection jobs", value: stats.jobs.total ?? 0 },
          ].map((s) => (
            <Card key={s.label}><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: "#0066CC" }}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent></Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Requirement records by verification status</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={recordData} margin={{ top: 8, right: 8, bottom: 40, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" angle={-32} textAnchor="end" height={70} tick={{ fontSize: 10 }} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <ReTooltip />
                <Bar dataKey="count" fill="#E8501A" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm">Programmes by verification status</CardTitle></CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={programmeData} margin={{ top: 8, right: 8, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="status" angle={-32} textAnchor="end" height={70} tick={{ fontSize: 10 }} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <ReTooltip />
                  <Bar dataKey="count" fill="#0066CC" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm">Coverage by destination country</CardTitle></CardHeader>
            <CardContent className="max-h-56 overflow-y-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground border-b"><th className="py-1">Country</th><th className="py-1">Institutions</th><th className="py-1">Programmes</th></tr></thead>
                <tbody>
                  {countryData.map((c) => (
                    <tr key={c.country} className="border-b last:border-0">
                      <td className="py-1.5 font-medium">{c.country}</td>
                      <td className="py-1.5">{c.institutions}</td>
                      <td className="py-1.5">{c.programmes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm">Source registry composition</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              <Badge style={{ backgroundColor: "#0066CC", color: "white" }}>L1 official: {stats.sources.official}</Badge>
              <Badge variant="secondary">L2 platform: {stats.sources.platform}</Badge>
              <Badge variant="secondary">L3 public: {stats.sources.public}</Badge>
              <Badge variant="outline">internal: {stats.sources.internal}</Badge>
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">identity pending: {stats.sources.pendingIdentity}</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm">Collection jobs by outcome</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {Object.entries(stats.jobs).map(([k, v]) => (
                <Badge key={k} className={STATUS_STYLES[k] ?? ""}>{k}: {v}</Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

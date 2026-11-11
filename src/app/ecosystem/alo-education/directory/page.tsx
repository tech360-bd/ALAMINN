"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DirectoryView } from "@/components/uci/DirectoryView";
import { ProgrammeView } from "@/components/uci/ProgrammeView";
import { SourcesView } from "@/components/uci/SourcesView";
import { GraduationCap, Search, BookOpen, Globe, Info, LogIn, LayoutDashboard } from "lucide-react";

interface Stats {
  institutions: number;
  priorityCohort: number;
  universities: number;
  pathwayProviders: number;
  requirementRecords: number;
  programmes: number;
  recordsByStatus: Record<string, number>;
  programmesByStatus: Record<string, number>;
  byCountry: Record<string, { institutions: number; programmes: number }>;
  conflictCount: number;
  sources: { total: number; official: number; platform: number; public: number; internal: number; pendingIdentity: number };
  jobs: Record<string, number>;
}

export default function Page() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const load = () => {
      fetch("/api/uci/stats").then((r) => r.json()).then(setStats).catch(() => {});
    };
    load();
    fetch("/api/auth/me").then((r) => setAuthed(r.ok)).catch(() => {});
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const verified = stats?.recordsByStatus.APPROVED_FOR_PUBLICATION ?? 0;
  const officialVerified = stats?.recordsByStatus.OFFICIAL_SOURCE_VERIFIED ?? 0;
  const pending = stats?.recordsByStatus.SOURCE_CHECK_REQUIRED ?? 0;
  const conflictsCount = stats?.conflictCount ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#E8501A" }}>
              <GraduationCap className="h-5 w-5 text-white" aria-hidden />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">
                ALO Education <span style={{ color: "#E8501A" }}>University & Course Intelligence</span>
              </h1>
              <p className="text-[11px] text-muted-foreground">Live, verified, continuously monitored university & course directory — powered by alaminn.info</p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
            <div className="text-center px-2">
              <p className="font-bold text-base" style={{ color: "#0066CC" }}>{stats?.institutions ?? "—"}</p>
              <p className="text-muted-foreground">institutions</p>
            </div>
            <div className="text-center px-2">
              <p className="font-bold text-base" style={{ color: "#0066CC" }}>{stats?.programmes ?? "—"}</p>
              <p className="text-muted-foreground">programmes</p>
            </div>
            <div className="text-center px-2">
              <p className="font-bold text-base" style={{ color: "#E8501A" }}>{stats?.requirementRecords ?? "—"}</p>
              <p className="text-muted-foreground">source records</p>
            </div>
            <div className="text-center px-2">
              <p className="font-bold text-base" style={{ color: "#2f9e44" }}>{officialVerified + verified}</p>
              <p className="text-muted-foreground">verified</p>
            </div>
            <div className="text-center px-2">
              <p className="font-bold text-base text-amber-600">{pending}</p>
              <p className="text-muted-foreground">awaiting check</p>
            </div>
            <nav className="flex items-center gap-2 pl-2 border-l ml-1">
              <a href="/login" className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-accent" style={{ color: "#0066CC" }}>
                <LogIn className="h-3.5 w-3.5" aria-hidden /> Staff sign in
              </a>
              {authed && (
                <a href="/dashboard" className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: "#E8501A" }}>
                  <LayoutDashboard className="h-3.5 w-3.5" aria-hidden /> Dashboard
                </a>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* honesty strip */}
      <div className="bg-[#FFF8EF] border-b">
        <div className="max-w-7xl mx-auto px-4 py-1.5 flex items-center gap-2 text-[11px] text-amber-900">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Every record shows its source and last-checked date. Missing information is shown as unknown — never filled in. Conflicting values ({conflictsCount}) are preserved and sent to human review, not silently resolved.
        </div>
      </div>

      {/* Main — public views. Verification console, audit trail and the agent
          console live behind authenticated, role-gated routes (/admin, /console). */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-5">
        <Tabs defaultValue="directory">
          <TabsList className="flex-wrap h-auto mb-4">
            <TabsTrigger value="directory" className="gap-1"><Search className="h-3.5 w-3.5" /> Directory</TabsTrigger>
            <TabsTrigger value="programmes" className="gap-1"><BookOpen className="h-3.5 w-3.5" /> Programmes</TabsTrigger>
            <TabsTrigger value="sources" className="gap-1"><Globe className="h-3.5 w-3.5" /> Sources</TabsTrigger>
          </TabsList>
          <TabsContent value="directory"><DirectoryView /></TabsContent>
          <TabsContent value="programmes"><ProgrammeView /></TabsContent>
          <TabsContent value="sources"><SourcesView /></TabsContent>
        </Tabs>
      </main>

      {/* Footer — sticky on short pages, pushed naturally on long pages */}
      <footer className="mt-auto border-t bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold" style={{ color: "#E8501A" }}>ALO Education</span> — original university & course intelligence for Bangladeshi students planning international study.
            Facts carry their source; explanations are written by ALO Education.
          </p>
          <p className="flex items-center gap-3">
            <span>Source levels: 1 official · 2 platform · 3 public</span>
            <a href="https://alaminn.info" className="font-medium underline" style={{ color: "#0066CC" }}>alaminn.info</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

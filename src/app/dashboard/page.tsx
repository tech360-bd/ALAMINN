"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  GraduationCap, LogOut, ShieldCheck, MessagesSquare, BarChart3, Settings, Users, Search, Loader2, ClipboardList,
} from "lucide-react";

interface Me { account: { email: string; name: string; role: string }; permissions: string[] }

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "#E8501A", EDITOR: "#0066CC", AGENT: "#2f9e44", VIEWER: "#64748b",
};

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [stats, setStats] = useState<{ institutions: number; programmes: number; requirementRecords: number; conflictCount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
      fetch("/api/uci/stats").then((r) => r.json()).catch(() => null),
    ])
      .then(([meData, statsData]) => { setMe(meData); setStats(statsData); })
      .catch(() => router.replace("/login?next=/dashboard"))
      .finally(() => setLoading(false));
  }, [router]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const role = me?.account.role ?? "VIEWER";
  const color = ROLE_COLORS[role] ?? "#64748b";

  const links: { href: string; label: string; icon: React.ReactNode; show: boolean }[] = [
    { href: "/admin/uci", label: "Verification QC console (import/export, audit)", icon: <ShieldCheck className="h-4 w-4" />, show: role === "ADMIN" || role === "EDITOR" },
    { href: "/console", label: "Agent console (Universal Messaging Channel)", icon: <MessagesSquare className="h-4 w-4" />, show: role === "ADMIN" || role === "AGENT" },
    { href: "/reports", label: "Reports & analytics", icon: <BarChart3 className="h-4 w-4" />, show: role !== "AGENT" },
    { href: "/settings", label: "Tenant settings", icon: <Settings className="h-4 w-4" />, show: role === "ADMIN" },
    { href: "/", label: "Public directory", icon: <Search className="h-4 w-4" />, show: true },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b bg-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#E8501A" }}>
            <GraduationCap className="h-5 w-5 text-white" aria-hidden />
          </div>
          <div className="flex-1">
            <h1 className="font-bold text-base leading-tight">ALO Education — Staff Dashboard</h1>
            <p className="text-[11px] text-muted-foreground">Role-based workspace · every action is audit-logged</p>
          </div>
          <Button variant="outline" size="sm" onClick={logout} className="gap-1"><LogOut className="h-3.5 w-3.5" /> Sign out</Button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 space-y-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              Welcome, {me?.account.name}
              <Badge style={{ backgroundColor: color, color: "white" }} className="ml-1">{role}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{me?.account.email}</span>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "institutions", value: stats?.institutions },
            { label: "programmes", value: stats?.programmes },
            { label: "source records", value: stats?.requirementRecords },
            { label: "open conflicts", value: stats?.conflictCount },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold" style={{ color: "#0066CC" }}>{s.value ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Your workspaces</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {links.filter((l) => l.show).map((l) => (
              <a key={l.href} href={l.href}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent transition-colors"
                style={{ borderColor: "#e5e7eb" }}>
                <span style={{ color: "#0066CC" }}>{l.icon}</span>
                {l.label}
              </a>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Users className="h-4 w-4" /> Effective permissions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {me?.permissions.map((p) => <Badge key={p} variant="secondary" className="font-mono text-[10px]">{p}</Badge>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1"><ClipboardList className="h-4 w-4" /> Verification honesty rule</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Records only publish after OFFICIAL_SOURCE_VERIFIED → APPROVED_FOR_PUBLICATION. Conflicting values are preserved
            and routed to human review; unknown stays unknown everywhere in this system.
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

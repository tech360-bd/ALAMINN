"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminView } from "@/components/uci/AdminView";
import { AuditView } from "@/components/uci/AuditView";
import StaffManager from "@/components/staff/StaffManager";
import { ArrowLeft, Loader2, ShieldCheck, ClipboardList, Users, FileDown, FileUp } from "lucide-react";

export default function AdminPage() {
  const [me, setMe] = useState<{ account: { name: string; email: string; role: string }; permissions: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setMe)
      .catch(() => (window.location.href = "/login?next=/admin/uci"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const role = me?.account.role ?? "";
  const canImport = me?.permissions.includes("import.run") ?? false;
  const canExport = me?.permissions.includes("export.run") ?? false;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: "#0066CC" }}>
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <div className="flex-1">
            <h1 className="font-bold text-base leading-tight flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" style={{ color: "#E8501A" }} /> Admin console
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Signed in as {me?.account.email} ({role}) — unverified records never auto-publish; conflicts go to human review.
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            {canExport && (
              <a href="/api/uci/export?entity=institutions" className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5" style={{ color: "#0066CC" }}>
                <FileDown className="h-3.5 w-3.5" /> Export
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-5">
        <Tabs defaultValue="queue">
          <TabsList className="flex-wrap h-auto mb-4">
            <TabsTrigger value="queue" className="gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Verification QC</TabsTrigger>
            <TabsTrigger value="staff" className="gap-1"><Users className="h-3.5 w-3.5" /> Staff &amp; roles</TabsTrigger>
            <TabsTrigger value="audit" className="gap-1"><ClipboardList className="h-3.5 w-3.5" /> Audit &amp; migration</TabsTrigger>
          </TabsList>
          <TabsContent value="queue">
            {canImport && (
              <p className="text-[11px] text-muted-foreground mb-3 flex items-center gap-1">
                <FileUp className="h-3 w-3" /> CSV import (with duplicate protection) and full CSV export are available in the verification console below and via /api/uci/import and /api/uci/export.
              </p>
            )}
            <AdminView />
          </TabsContent>
          <TabsContent value="staff">{role === "ADMIN" ? <StaffManager /> : <p className="text-sm text-muted-foreground">Only ADMIN can manage staff accounts.</p>}</TabsContent>
          <TabsContent value="audit"><AuditView /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

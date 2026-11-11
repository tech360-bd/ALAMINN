"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Save, Settings as SettingsIcon } from "lucide-react";

interface Tenant {
  id: string; slug: string; name: string; timezone: string;
  messagingStart: number; messagingEnd: number; languages: string; aiAutoReply: boolean;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState<{ account: { role: string } } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        return d;
      }),
      fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([s, m]) => { setTenant(s.tenant); setMe(m); })
      .catch((e) => toast({ title: "Cannot load settings", description: (e as Error).message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  const isAdmin = me?.account?.role === "ADMIN";

  const save = async () => {
    if (!tenant) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: tenant.name,
          timezone: tenant.timezone,
          messagingStart: Number(tenant.messagingStart),
          messagingEnd: Number(tenant.messagingEnd),
          languages: tenant.languages,
          aiAutoReply: tenant.aiAutoReply,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setTenant(d.tenant);
      toast({ title: "Settings saved", description: "The messaging service enforces this window on every send." });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!tenant) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">No tenant provisioned yet.</div>;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b bg-white sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: "#0066CC" }}>
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <h1 className="font-bold text-base flex items-center gap-1.5">
            <SettingsIcon className="h-4 w-4" style={{ color: "#E8501A" }} /> Tenant settings
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Messaging &amp; compliance configuration</CardTitle>
            <p className="text-[11px] text-muted-foreground">Identifier: {tenant.slug} · changes are audit-logged</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="s-name">Display name</Label>
                <Input id="s-name" value={tenant.name} disabled={!isAdmin} onChange={(e) => setTenant({ ...tenant, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="s-tz">Timezone (IANA)</Label>
                <Input id="s-tz" value={tenant.timezone} disabled={!isAdmin} onChange={(e) => setTenant({ ...tenant, timezone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="s-start">Messaging window start (hour 0–23)</Label>
                <Input id="s-start" type="number" min={0} max={23} value={tenant.messagingStart} disabled={!isAdmin}
                  onChange={(e) => setTenant({ ...tenant, messagingStart: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="s-end">Messaging window end (hour 0–23)</Label>
                <Input id="s-end" type="number" min={0} max={23} value={tenant.messagingEnd} disabled={!isAdmin}
                  onChange={(e) => setTenant({ ...tenant, messagingEnd: Number(e.target.value) })} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="s-langs">Languages (comma-separated: bn, en, banglish)</Label>
                <Input id="s-langs" value={tenant.languages} disabled={!isAdmin} onChange={(e) => setTenant({ ...tenant, languages: e.target.value })} />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch id="s-ai" checked={tenant.aiAutoReply} disabled={!isAdmin} onCheckedChange={(v) => setTenant({ ...tenant, aiAutoReply: v })} />
                <Label htmlFor="s-ai" className="text-sm font-normal">AI auto-reply enabled</Label>
              </div>
            </div>
            <Button onClick={save} disabled={!isAdmin || saving} className="gap-1 text-white" style={{ backgroundColor: "#E8501A" }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
            </Button>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">Read-only view — saving requires the ADMIN role.</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

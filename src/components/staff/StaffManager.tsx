"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, Users, ShieldCheck } from "lucide-react";

interface Account {
  id: string; email: string; name: string; role: string; isActive: boolean;
  lastLoginAt: string | null; createdAt: string;
}

const ROLES = ["ADMIN", "EDITOR", "AGENT", "VIEWER"];

export default function StaffManager() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>("");
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "VIEWER" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/staff");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setAccounts(d.accounts);
    } catch (e) {
      toast({ title: "Cannot load accounts", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy("create");
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast({ title: "Account created", description: `${d.account.email} (${d.account.role})` });
      setForm({ email: "", name: "", password: "", role: "VIEWER" });
      await load();
    } catch (e) {
      toast({ title: "Create failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const patch = async (id: string, body: Record<string, unknown>, label: string) => {
    setBusy(id + label);
    try {
      const res = await fetch(`/api/staff/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast({ title: label + " done" });
      await load();
    } catch (e) {
      toast({ title: `${label} refused`, description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const deactivate = async (id: string) => {
    setBusy(id + "deactivate");
    try {
      const res = await fetch(`/api/staff/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast({ title: "Account deactivated" });
      await load();
    } catch (e) {
      toast({ title: "Deactivate refused", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1"><UserPlus className="h-4 w-4" style={{ color: "#E8501A" }} /> Create staff account</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-5 gap-2">
          <div className="space-y-1"><Label htmlFor="st-email">Email</Label><Input id="st-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="st-name">Name</Label><Input id="st-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="st-pass">Password (min 10)</Label><Input id="st-pass" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div className="space-y-1">
            <Label htmlFor="st-role">Role</Label>
            <select id="st-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full" aria-label="Role">
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <Button disabled={busy !== "" || !form.email || !form.name || form.password.length < 10}
              onClick={create} className="w-full text-white" style={{ backgroundColor: "#E8501A" }}>
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1"><Users className="h-4 w-4" /> Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
          {!loading && accounts.length === 0 && <p className="text-sm text-muted-foreground">No accounts yet.</p>}
          {accounts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
              <div className="flex-1 min-w-40">
                <p className="text-sm font-medium">{a.name} <span className="text-muted-foreground font-normal">({a.email})</span></p>
                <p className="text-[11px] text-muted-foreground">
                  Last login: {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "never"} · Created {new Date(a.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Badge style={{ backgroundColor: a.isActive ? "#2f9e44" : "#94a3b8", color: "white" }}>{a.isActive ? "active" : "inactive"}</Badge>
              <select
                value={a.role}
                disabled={busy !== ""}
                onChange={(e) => patch(a.id, { role: e.target.value }, "Role change")}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                aria-label={`Role for ${a.email}`}
              >
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
              <Button size="sm" variant="outline" disabled={busy !== ""}
                onClick={() => patch(a.id, { isActive: !a.isActive }, a.isActive ? "Deactivate" : "Reactivate")}>
                {busy === a.id + (a.isActive ? "Deactivate" : "Reactivate") ? <Loader2 className="h-3 w-3 animate-spin" /> : a.isActive ? "Deactivate" : "Reactivate"}
              </Button>
              {a.isActive && (
                <Button size="sm" variant="ghost" disabled={busy !== ""} onClick={() => deactivate(a.id)}
                  className="text-red-600 hover:text-red-700">
                  {busy === a.id + "deactivate" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Deactivate"}
                </Button>
              )}
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1">
            <ShieldCheck className="h-3 w-3" /> Role changes and deactivations revoke all existing sessions immediately. The last active admin cannot be removed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

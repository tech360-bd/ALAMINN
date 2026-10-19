"use client";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { adminFetch } from "@/components/admin/lib";
import { toast } from "sonner";
type State = { engagementEnabled: boolean; publishingEnabled: boolean; generationEnabled: boolean; version: number; changedByName: string | null; updatedAt: string };
/** Global automation switch (spec §5). Server-enforced; this is only the control surface. Manual replies stay available when OFF. */
export function AutomationSwitch() {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { adminFetch<State>("/api/v1/admin/social/automation").then((e) => setS(e.data)).catch(() => setS(null)); }, []);
  async function toggle(v: boolean) {
    setBusy(true);
    try { const e = await adminFetch<State>("/api/v1/admin/social/automation", { method: "PUT", body: JSON.stringify({ engagementEnabled: v }) }); setS(e.data); toast.success(v ? "Automation ON — eligible rules may auto-reply." : "Automation OFF — auto-replies blocked server-side. Manual replies still work."); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Only OWNER/SUPER_ADMIN can change this."); }
    finally { setBusy(false); }
  }
  if (!s) return null;
  return (
    <div className="flex items-center gap-2" title={s.changedByName ? `Last changed by ${s.changedByName} · v${s.version}` : `v${s.version}`}>
      <span className={`text-xs font-semibold ${s.engagementEnabled ? "text-emerald-600" : "text-rose-600"}`}>AI Auto-Reply {s.engagementEnabled ? "ON" : "OFF"}</span>
      <Switch checked={s.engagementEnabled} onCheckedChange={toggle} disabled={busy} aria-label="Global automation switch" />
    </div>
  );
}

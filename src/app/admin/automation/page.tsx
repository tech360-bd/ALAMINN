"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { adminFetch, fmtDate } from "@/components/admin/lib";
import { Loader2, Plus, RefreshCw, Send, Trash2, Zap } from "lucide-react";

type Rule = { id: string; name: string; trigger: string; conditions: string; actions: string; status: string; runCount: number; lastRunAt: string | null };
type Sequence = { id: string; name: string; description: string; trigger: string; status: string; steps: string; enrollCount: number; activeEnrollments?: number; completedEnrollments?: number };
type RunLog = { id: string; ruleId: string; trigger: string; contactId: string | null; status: string; detail: string | null; createdAt: string };

const TRIGGERS = ["contact.created", "contact.updated", "inquiry.created", "opportunity.stage_changed", "lead.score_changed"];
const OPS = ["eq", "neq", "contains", "not_contains", "starts_with", "gt", "gte", "lt", "lte", "in", "exists"];
const ACTIONS = ["add_tag", "remove_tag", "set_status", "set_channel", "create_task", "notify_staff", "enroll_sequence", "move_stage", "emit_webhook"];
const CONTACT_FIELDS = ["contact.leadScore", "contact.leadScoreGrade", "contact.country", "contact.organization", "contact.status", "contact.tags", "contact.source", "contact.preferredChannel"];

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

type ConditionRow = { field: string; op: string; value: string };
type ActionRow = { type: string; params: string };

export default function AdminAutomationPage() {
  const [tab, setTab] = useState<"rules" | "sequences" | "runs">("rules");
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<Rule[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [busy, setBusy] = useState(false);

  // Rule editor state
  const [ruleForm, setRuleForm] = useState<{ name: string; trigger: string; status: string; conditions: ConditionRow[]; actions: ActionRow[] }>({
    name: "", trigger: "contact.created", status: "draft", conditions: [], actions: [{ type: "add_tag", params: "tag=hot-lead" }],
  });
  // Sequence editor state
  const [seqForm, setSeqForm] = useState<{ name: string; description: string; trigger: string; status: string; steps: Array<{ delayHours: string; subject: string; bodyText: string }> }>({
    name: "", description: "", trigger: "manual", status: "draft", steps: [{ delayHours: "24", subject: "", bodyText: "" }],
  });
  const [enrollInput, setEnrollInput] = useState<{ sequenceId: string; contactIds: string }>({ sequenceId: "", contactIds: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesJson, seqJson, runsJson] = await Promise.all([
        adminFetch<Rule[]>("/api/v1/admin/automation/rules?pageSize=100"),
        adminFetch<Sequence[]>("/api/v1/admin/automation/sequences?pageSize=100"),
        adminFetch<RunLog[]>("/api/v1/admin/automation/runs?pageSize=50"),
      ]);
      setRules(rulesJson.data ?? []);
      setSequences(seqJson.data ?? []);
      setRuns(runsJson.data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load automation data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveRule() {
    setBusy(true);
    try {
      await adminFetch("/api/v1/admin/automation/rules", {
        method: "POST",
        body: JSON.stringify({
          name: ruleForm.name,
          trigger: ruleForm.trigger,
          status: ruleForm.status,
          conditions: ruleForm.conditions.filter((c) => c.field && c.op),
          actions: ruleForm.actions.map((a) => ({
            type: a.type,
            params: a.params
              ? Object.fromEntries(a.params.split("\n").filter((l) => l.includes("=")).map((l) => {
                  const idx = l.indexOf("=");
                  return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
                }))
              : {},
          })),
        }),
      });
      toast.success("Rule created. Active rules run on matching trigger events.");
      setRuleForm({ name: "", trigger: "contact.created", status: "draft", conditions: [], actions: [{ type: "add_tag", params: "tag=hot-lead" }] });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally { setBusy(false); }
  }

  async function saveSequence() {
    setBusy(true);
    try {
      await adminFetch("/api/v1/admin/automation/sequences", {
        method: "POST",
        body: JSON.stringify({
          name: seqForm.name,
          description: seqForm.description,
          trigger: seqForm.trigger,
          status: seqForm.status,
          steps: seqForm.steps
            .filter((s) => s.subject.trim() && s.bodyText.trim())
            .map((s) => ({ delayHours: Number(s.delayHours) || 0, subject: s.subject, bodyText: s.bodyText })),
        }),
      });
      toast.success("Sequence created. Activate it, then enroll contacts.");
      setSeqForm({ name: "", description: "", trigger: "manual", status: "draft", steps: [{ delayHours: "24", subject: "", bodyText: "" }] });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally { setBusy(false); }
  }

  async function enroll() {
    const ids = enrollInput.contactIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!enrollInput.sequenceId || !ids.length) {
      toast.error("Pick a sequence and paste at least one contact ID.");
      return;
    }
    setBusy(true);
    try {
      const r = await adminFetch<Array<{ ok: boolean; message: string }>>(`/api/v1/admin/automation/sequences/${enrollInput.sequenceId}/enroll`, {
        method: "POST",
        body: JSON.stringify({ contactIds: ids.slice(0, 100) }),
      });
      const ok = (r.data ?? []).filter((x) => x.ok).length;
      toast.success(`${ok} of ${ids.length} contact(s) enrolled.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enroll failed.");
    } finally { setBusy(false); }
  }

  async function remove(kind: "rules" | "sequences", id: string) {
    if (!confirm("Delete this item?")) return;
    try {
      await adminFetch(`/api/v1/admin/automation/${kind}/${id}`, { method: "DELETE" });
      toast.success("Deleted.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Zap className="h-6 w-6" /> Automation</h1>
          <p className="text-sm text-muted-foreground">Trigger rules and follow-up email sequences. Every run is logged with its real outcomes.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </div>

      <div className="flex gap-2">
        {(["rules", "sequences", "runs"] as const).map((t) => (
          <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)}>
            {t === "rules" ? "Trigger Rules" : t === "sequences" ? "Email Sequences" : "Run Logs"}
          </Button>
        ))}
      </div>

      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : tab === "rules" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            {rules.length === 0 ? <p className="text-sm text-muted-foreground">No rules yet.</p> : rules.map((rule) => (
              <div key={rule.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{rule.name}</div>
                    <div className="text-xs text-muted-foreground">{rule.trigger} · {rule.runCount} run(s){rule.lastRunAt ? ` · last ${fmtDate(rule.lastRunAt)}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={rule.status === "active" ? "default" : "secondary"}>{rule.status}</Badge>
                    <Button size="icon" variant="ghost" onClick={() => void remove("rules", rule.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Conditions: {parseJson<ConditionRow[]>(rule.conditions, []).map((c) => `${c.field} ${c.op} ${c.value ?? ""}`).join(" AND ") || "(always)"}</div>
                  <div>Actions: {parseJson<ActionRow[]>(rule.actions, []).map((a) => `${a.type}(${a.params ?? ""})`).join(" → ")}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border p-4 space-y-3">
            <h2 className="font-medium">New trigger rule</h2>
            <Input placeholder="Rule name (e.g. Hot lead → notify + task)" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select className="rounded border p-2 text-sm" value={ruleForm.trigger} onChange={(e) => setRuleForm({ ...ruleForm, trigger: e.target.value })}>
                {TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="rounded border p-2 text-sm" value={ruleForm.status} onChange={(e) => setRuleForm({ ...ruleForm, status: e.target.value })}>
                {["draft", "active", "paused"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Conditions (all must match)</p>
              {ruleForm.conditions.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-1">
                  <select className="rounded border p-1 text-xs" value={c.field} onChange={(e) => setRuleForm({ ...ruleForm, conditions: ruleForm.conditions.map((x, j) => j === i ? { ...x, field: e.target.value } : x) })}>
                    <option value="">(field)</option>
                    {CONTACT_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select className="rounded border p-1 text-xs" value={c.op} onChange={(e) => setRuleForm({ ...ruleForm, conditions: ruleForm.conditions.map((x, j) => j === i ? { ...x, op: e.target.value } : x) })}>
                    {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <Input className="h-7 text-xs" value={c.value} onChange={(e) => setRuleForm({ ...ruleForm, conditions: ruleForm.conditions.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRuleForm({ ...ruleForm, conditions: ruleForm.conditions.filter((_, j) => j !== i) })}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setRuleForm({ ...ruleForm, conditions: [...ruleForm.conditions, { field: "contact.leadScore", op: "gte", value: "80" }] })}><Plus className="h-3 w-3 mr-1" /> Condition</Button>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Actions (params as key=value lines)</p>
              {ruleForm.actions.map((a, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex gap-1">
                    <select className="rounded border p-1 text-xs flex-1" value={a.type} onChange={(e) => setRuleForm({ ...ruleForm, actions: ruleForm.actions.map((x, j) => j === i ? { ...x, type: e.target.value } : x) })}>
                      {ACTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRuleForm({ ...ruleForm, actions: ruleForm.actions.filter((_, j) => j !== i) })}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  <Textarea className="text-xs" rows={2} placeholder={"tag=hot-lead\nroles=SUPER_ADMIN,CRM_MANAGER"} value={a.params} onChange={(e) => setRuleForm({ ...ruleForm, actions: ruleForm.actions.map((x, j) => j === i ? { ...x, params: e.target.value } : x) })} />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setRuleForm({ ...ruleForm, actions: [...ruleForm.actions, { type: "create_task", params: "title=Follow up hot lead\npriority=high" }] })}><Plus className="h-3 w-3 mr-1" /> Action</Button>
            </div>
            <Button onClick={() => void saveRule()} disabled={busy || !ruleForm.name.trim()}>Create rule</Button>
          </div>
        </div>
      ) : tab === "sequences" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            {sequences.length === 0 ? <p className="text-sm text-muted-foreground">No sequences yet.</p> : sequences.map((s) => {
              const steps = parseJson<Array<{ delayHours: number; subject: string }>>(s.steps, []);
              return (
                <div key={s.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{steps.length} step(s) · {s.activeEnrollments ?? 0} active / {s.completedEnrollments ?? 0} completed enrollment(s)</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
                      <Button size="icon" variant="ghost" onClick={() => void remove("sequences", s.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <ol className="list-decimal pl-4 text-xs text-muted-foreground">
                    {steps.map((st, i) => <li key={i}>+{st.delayHours}h — {st.subject}</li>)}
                  </ol>
                </div>
              );
            })}
            <div className="rounded-lg border border-dashed p-3 space-y-2">
              <p className="text-sm font-medium">Enroll contacts</p>
              <select className="rounded border p-2 text-sm w-full" value={enrollInput.sequenceId} onChange={(e) => setEnrollInput({ ...enrollInput, sequenceId: e.target.value })}>
                <option value="">(choose an active sequence)</option>
                {sequences.filter((s) => s.status === "active").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <Textarea rows={2} placeholder="Contact IDs (paste from the contacts list, comma or newline separated)" value={enrollInput.contactIds} onChange={(e) => setEnrollInput({ ...enrollInput, contactIds: e.target.value })} />
              <Button size="sm" variant="outline" onClick={() => void enroll()} disabled={busy}><Send className="h-3 w-3 mr-1" /> Enroll</Button>
              <p className="text-xs text-muted-foreground">Sends require marketing consent on the contact&apos;s latest inquiry; the 15-minute automation-queue cron delivers due steps.</p>
            </div>
          </div>
          <div className="rounded-lg border p-4 space-y-3">
            <h2 className="font-medium">New sequence</h2>
            <Input placeholder="Sequence name (e.g. New lead nurture — 3 emails)" value={seqForm.name} onChange={(e) => setSeqForm({ ...seqForm, name: e.target.value })} />
            <Input placeholder="Description (optional)" value={seqForm.description} onChange={(e) => setSeqForm({ ...seqForm, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select className="rounded border p-2 text-sm" value={seqForm.trigger} onChange={(e) => setSeqForm({ ...seqForm, trigger: e.target.value })}>
                {["manual", "contact.created", "inquiry.created"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="rounded border p-2 text-sm" value={seqForm.status} onChange={(e) => setSeqForm({ ...seqForm, status: e.target.value })}>
                {["draft", "active", "paused"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {seqForm.steps.map((st, i) => (
              <div key={i} className="space-y-1 rounded border p-2">
                <div className="flex gap-1">
                  <Input className="h-7 text-xs w-24" placeholder="+hours" value={st.delayHours} onChange={(e) => setSeqForm({ ...seqForm, steps: seqForm.steps.map((x, j) => j === i ? { ...x, delayHours: e.target.value } : x) })} />
                  <Input className="h-7 text-xs" placeholder="Step subject — {{first_name}} supported" value={st.subject} onChange={(e) => setSeqForm({ ...seqForm, steps: seqForm.steps.map((x, j) => j === i ? { ...x, subject: e.target.value } : x) })} />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSeqForm({ ...seqForm, steps: seqForm.steps.filter((_, j) => j !== i) })}><Trash2 className="h-3 w-3" /></Button>
                </div>
                <Textarea className="text-xs" rows={3} placeholder="Step body text" value={st.bodyText} onChange={(e) => setSeqForm({ ...seqForm, steps: seqForm.steps.map((x, j) => j === i ? { ...x, bodyText: e.target.value } : x) })} />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setSeqForm({ ...seqForm, steps: [...seqForm.steps, { delayHours: "48", subject: "", bodyText: "" }] })}><Plus className="h-3 w-3 mr-1" /> Step</Button>
            <Button onClick={() => void saveSequence()} disabled={busy || !seqForm.name.trim()}>Create sequence</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {runs.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No automation runs recorded yet.</p> : runs.map((run) => (
            <div key={run.id} className="flex items-start justify-between gap-3 p-3 text-sm">
              <div>
                <div className="font-mono text-xs">{run.trigger}{run.contactId ? ` · contact ${run.contactId.slice(0, 10)}…` : ""}</div>
                <div className="text-xs text-muted-foreground">{run.detail ? run.detail.slice(0, 160) : "(no action detail)"}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={run.status === "success" ? "default" : run.status === "skipped" ? "secondary" : "destructive"}>{run.status}</Badge>
                <span className="text-xs text-muted-foreground">{fmtDate(run.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

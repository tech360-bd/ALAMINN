"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, ErrorState, EmptyState } from "@/components/admin/page-primitives";
import { adminFetch, fmtDate } from "@/components/admin/lib";
import { toast } from "sonner";

type P = { id: string; name: string; isDefault: boolean; identity: string | null; brandContext: string | null; languages: string; formality: number; friendliness: number; greeting: string | null; signOff: string | null; faqs: string | null; neverAnswerTopics: string | null; examplePairs: string | null };
const blank = { name: "Al-Amin (default)", identity: "Al-Amin — education & business consultant, ALO Education / Tech360", brandContext: "Study-abroad advisory (ALO Education), technology and business consulting. Never guarantee admission, visa, scholarships or jobs.", languages: "en,bn", formality: "3", friendliness: "4", greeting: "Assalamu Alaikum, thank you for reaching out.", signOff: "— Team Al-Amin (AI assistant)", faqs: "[]", neverAnswerTopics: '["visa guarantee","legal advice","refund dispute"]', examplePairs: "[]" };
export default function PersonalityPage() {
  const [rows, setRows] = useState<P[]>([]); const [, setLoading] = useState(false); const [f, setF] = useState(blank); const [kb, setKb] = useState({ title: "", category: "faq", content: "", approved: true });
  const [test, setTest] = useState({ message: "UK te MSc korte koto khoroch hobe?", platform: "whatsapp" }); const [testOut, setTestOut] = useState("");
  async function load() { setLoading(true); try { const e = await adminFetch<P[]>("/api/v1/admin/social/personality"); setRows(e.data); if (e.data[0]) { const p = e.data[0]; setF({ name: p.name, identity: p.identity || "", brandContext: p.brandContext || "", languages: p.languages, formality: String(p.formality), friendliness: String(p.friendliness), greeting: p.greeting || "", signOff: p.signOff || "", faqs: p.faqs || "[]", neverAnswerTopics: p.neverAnswerTopics || "[]", examplePairs: p.examplePairs || "[]" }); } } catch { /* keep defaults */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function save(e: React.FormEvent) { e.preventDefault(); try { const body = { ...f, formality: Number(f.formality), friendliness: Number(f.friendliness), isDefault: true, id: rows[0]?.id }; await adminFetch("/api/v1/admin/social/personality", { method: rows[0] ? "PUT" : "POST", body: JSON.stringify(body) }); toast.success("Personality saved — new drafts will use it immediately."); load(); } catch (err) { toast.error(String(err)); } }
  async function addKb(e: React.FormEvent) { e.preventDefault(); try { await adminFetch("/api/v1/admin/social/knowledge", { method: "POST", body: JSON.stringify(kb) }); toast.success("Knowledge saved. Only APPROVED knowledge grounds replies."); setKb({ ...kb, title: "", content: "" }); } catch (err) { toast.error(String(err)); } }
  async function runTest() { try { const e = await adminFetch<{ reply: string; classification: unknown; knowledgeRefs: string[] }>("/api/v1/admin/social/personality/test", { method: "POST", body: JSON.stringify(test) }); setTestOut(`${e.data.reply}\n\n— classification: ${JSON.stringify(e.data.classification)} · grounded in: ${e.data.knowledgeRefs.join(", ") || "none (safe fallback)"}`); } catch (err) { toast.error(String(err)); } }
  return (<div className="p-6"><PageHeader title="AI Personality & Knowledge" subtitle="Replies speak as Al-Amin's team — grounded only in approved knowledge. The AI never claims Al-Amin personally wrote a message, and never invents prices or guarantees." />
  <Card className="mb-6"><CardHeader><CardTitle>Personality profile {rows[0] ? "(default)" : ""}</CardTitle></CardHeader><CardContent><form onSubmit={save} className="grid md:grid-cols-2 gap-3">
    <div><Label>Profile name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
    <div><Label>Languages (en,bn,banglish)</Label><Input value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} /></div>
    <div className="md:col-span-2"><Label>Identity</Label><Input value={f.identity} onChange={(e) => setF({ ...f, identity: e.target.value })} /></div>
    <div className="md:col-span-2"><Label>Brand context & restrictions</Label><Textarea value={f.brandContext} onChange={(e) => setF({ ...f, brandContext: e.target.value })} /></div>
    <div><Label>Greeting</Label><Input value={f.greeting} onChange={(e) => setF({ ...f, greeting: e.target.value })} /></div>
    <div><Label>Sign-off</Label><Input value={f.signOff} onChange={(e) => setF({ ...f, signOff: e.target.value })} /></div>
    <div><Label>Formality 1–5</Label><Input value={f.formality} onChange={(e) => setF({ ...f, formality: e.target.value })} /></div>
    <div><Label>Friendliness 1–5</Label><Input value={f.friendliness} onChange={(e) => setF({ ...f, friendliness: e.target.value })} /></div>
    <div className="md:col-span-2"><Label>Approved FAQs (JSON [{`{"q","a"}`}])</Label><Textarea value={f.faqs} onChange={(e) => setF({ ...f, faqs: e.target.value })} /></div>
    <div className="md:col-span-2"><Label>Never answer without approval (JSON list)</Label><Textarea value={f.neverAnswerTopics} onChange={(e) => setF({ ...f, neverAnswerTopics: e.target.value })} /></div>
    <div className="md:col-span-2"><Label>Style examples (JSON [{`{"incoming","approvedReply"}`}])</Label><Textarea value={f.examplePairs} onChange={(e) => setF({ ...f, examplePairs: e.target.value })} /></div>
    <Button type="submit">Save personality</Button></form></CardContent></Card>
  <div className="grid lg:grid-cols-2 gap-4"><Card><CardHeader><CardTitle>Approved knowledge base</CardTitle></CardHeader><CardContent><form onSubmit={addKb} className="space-y-2"><Input placeholder="Title e.g. UK MSc tuition guidance" value={kb.title} onChange={(e) => setKb({ ...kb, title: e.target.value })} required /><Textarea placeholder="Approved facts only — pricing, services, policies…" value={kb.content} onChange={(e) => setKb({ ...kb, content: e.target.value })} required /><label className="flex gap-2 text-sm items-center"><Switch checked={kb.approved} onCheckedChange={(v) => setKb({ ...kb, approved: v })} /> Approved for AI grounding</label><Button type="submit">Add knowledge</Button></form></CardContent></Card>
  <Card><CardHeader><CardTitle>Test console — sends nothing</CardTitle></CardHeader><CardContent className="space-y-2"><Textarea value={test.message} onChange={(e) => setTest({ ...test, message: e.target.value })} /><Button onClick={runTest}>Generate proposed reply</Button>{testOut && <pre className="whitespace-pre-wrap text-sm bg-muted p-3 rounded">{testOut}</pre>}</CardContent></Card></div></div>);
}

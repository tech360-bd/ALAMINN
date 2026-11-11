"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldAlert, ShieldQuestion, Globe, Loader2, ExternalLink, Hourglass, PauseCircle } from "lucide-react";
import { SourceLevelBadge, fmtDate } from "@/components/uci/shared";

interface Source {
  id: string; key: string; name: string; url: string | null; level: string;
  identityStatus: string; permissionNotes: string | null; robotsAllowed: boolean | null;
  lastCheckedAt: string | null; notes: string | null;
  jobStats: { total: number; success: number; failed: number; blocked: number; last: string | null } | null;
}

function RobotsIcon({ allowed }: { allowed: boolean | null }) {
  if (allowed === true) return <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> robots: allowed</span>;
  if (allowed === false) return <span className="inline-flex items-center gap-1 text-xs text-red-700"><ShieldAlert className="h-3.5 w-3.5" /> robots: disallowed</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ShieldQuestion className="h-3.5 w-3.5" /> robots: not checked</span>;
}

export function SourcesView() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [checkUrl, setCheckUrl] = useState("");
  const [checkSource, setCheckSource] = useState("official_university_pages");
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/uci/sources");
    const d = await res.json();
    setSources(d.sources);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const runCheck = async (sourceKey: string, targetUrl: string) => {
    setRunning(sourceKey + targetUrl);
    try {
      const res = await fetch("/api/uci/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceKey, targetUrl }),
      });
      const d = await res.json();
      if (d.error) {
        toast({ title: "Check refused", description: d.error, variant: "destructive" });
      } else {
        const j = d.job;
        toast({
          title: `Source check: ${j.status}`,
          description: `${j.httpStatus ? `HTTP ${j.httpStatus} · ` : ""}${j.findings ?? j.lastError ?? ""} ${j.bytes ? `(${j.bytes} bytes)` : ""}`,
        });
      }
      await load();
    } finally {
      setRunning(null);
    }
  };

  const groups: { level: string; title: string; desc: string }[] = [
    { level: "OFFICIAL", title: "Level 1 — Official university sources", desc: "Primary authority. Every important fact must be verified here before it is displayed as officially confirmed." },
    { level: "PLATFORM", title: "Level 2 — Education platform discovery sources", desc: "Used to discover universities, programmes and advertised requirements. Never published as officially confirmed without Level-1 verification." },
    { level: "PUBLIC", title: "Level 3 — Additional credible public sources", desc: "Official government education sources and recognised research databases. Configured per destination before use." },
    { level: "INTERNAL", title: "ALO internal evidence", desc: "ALO Education's own operational records. These are evidence of what ALO has recorded — not official university confirmations." },
  ];

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading source registry…</p>;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1"><Globe className="h-4 w-4" style={{ color: "#0066CC" }} /> Run a real source check</h3>
          <p className="text-xs text-muted-foreground">
            The system fetches <span className="font-mono">robots.txt</span> first and refuses any disallowed path, then fetches the target page,
            records the HTTP status, byte size and a SHA-256 content hash, and compares it with the previous check for change detection.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <Label htmlFor="check-url" className="sr-only">Target URL</Label>
              <Input id="check-url" placeholder="https://www.university.ac.uk/international/…" value={checkUrl} onChange={(e) => setCheckUrl(e.target.value)} />
            </div>
            <select value={checkSource} onChange={(e) => setCheckSource(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm" aria-label="Source">
              {sources.filter((s) => s.level === "OFFICIAL").map((s) => (
                <option key={s.key} value={s.key}>{s.name.slice(0, 60)}</option>
              ))}
            </select>
            <Button disabled={!checkUrl || running !== null} style={{ backgroundColor: "#0066CC" }} className="text-white"
              onClick={() => runCheck(checkSource, checkUrl)}>
              {running !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check now"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {groups.map((g) => {
        const items = sources.filter((s) => s.level === g.level);
        if (!items.length) return null;
        return (
          <div key={g.level} className="space-y-2">
            <div>
              <h3 className="font-semibold text-sm">{g.title}</h3>
              <p className="text-xs text-muted-foreground">{g.desc}</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {items.map((s) => (
                <Card key={s.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-medium leading-snug">{s.name}</h4>
                      <SourceLevelBadge level={s.level} />
                    </div>
                    {s.identityStatus === "PENDING_IDENTITY" && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-xs">
                        <PauseCircle className="h-3 w-3 mr-1" /> Identity pending — collection disabled until the exact source URL is confirmed
                      </Badge>
                    )}
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0066CC] underline break-all inline-flex items-center gap-1">
                        {s.url}<ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    )}
                    <p className="text-xs text-muted-foreground">{s.permissionNotes}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <RobotsIcon allowed={s.robotsAllowed} />
                      {s.jobStats && (
                        <>
                          <span className="inline-flex items-center gap-1"><Hourglass className="h-3.5 w-3.5" /> {s.jobStats.success}/{s.jobStats.total} checks OK</span>
                          {s.jobStats.failed > 0 && <span className="text-red-700">{s.jobStats.failed} failed</span>}
                          {s.jobStats.blocked > 0 && <span className="text-amber-700">{s.jobStats.blocked} robots-blocked</span>}
                          <span>last: {fmtDate(s.jobStats.last)}</span>
                        </>
                      )}
                    </div>
                    {s.url && s.identityStatus === "CONFIRMED" && (
                      <Button size="sm" variant="outline" disabled={running !== null}
                        onClick={() => runCheck(s.key, s.url!)}>
                        {running === s.key + s.url ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Check this source"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

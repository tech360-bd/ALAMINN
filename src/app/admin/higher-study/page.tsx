"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/page-primitives";
import { adminFetch, fmtDate } from "@/components/admin/lib";

type Overview = {
  aloEducation: {
    id: string; enabled: boolean; configured: boolean;
    lastTestAt: string | null; lastTestOk: boolean | null; lastTestMessage: string | null;
    testEndpoint: string;
  } | null;
  referrals: { total: number; byStatus: Record<string, number> };
  catalogue: { universities: number; courses: number; scholarships: number; supervisors: number; researchProjects: number };
  monitoring: { status: string; startedAt: string; completedAt: string | null; nextRunAt: string | null; sourcesChecked: number; sourcesFailed: number; changesDetected: number } | null;
};

const SECTIONS = [
  { href: "/admin/higher-study/monitoring", label: "Data Monitoring", desc: "Weekly official-source checks and the verification queue" },
  { href: "/admin/higher-study/universities", label: "Universities", desc: "Public discovery catalogue — source of truth: verified records" },
  { href: "/admin/higher-study/courses", label: "Courses", desc: "Programmes, fees, deadlines — approvals flow from monitoring" },
  { href: "/admin/higher-study/scholarships", label: "Scholarships", desc: "Funding records with verified official sources" },
  { href: "/admin/higher-study/supervisors", label: "Supervisors", desc: "Verified supervisor profiles for research applicants" },
  { href: "/admin/higher-study/research-projects", label: "Research Projects", desc: "PhD / research-master project listings" },
];

export default function HigherStudyOverviewPage() {
  const [d, setD] = useState<Overview | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { adminFetch<Overview>("/api/v1/higher-study/admin/overview").then((e) => setD(e.data)).catch(() => setErr(true)); }, []);
  if (err) return <div className="p-6 text-sm text-muted-foreground">Failed to load the Higher Education overview.</div>;
  if (!d) return <div className="p-6 text-sm text-muted-foreground">Loading Higher Education overview…</div>;

  const alo = d.aloEducation;
  const aloState = !alo ? "missing" : alo.lastTestOk === true ? "connected" : alo.lastTestOk === false ? "unreachable" : "untested";
  const aloBadge = aloState === "connected" ? <Badge>Connected</Badge> : aloState === "unreachable" ? <Badge variant="destructive">Last test failed</Badge> : aloState === "untested" ? <Badge variant="secondary">Not tested yet</Badge> : <Badge variant="destructive">Not registered</Badge>;

  const r = d.referrals.byStatus;
  const referralCards: [string, number][] = [
    ["Total referrals", d.referrals.total],
    ["Created", r["created"] ?? 0],
    ["Transferred to ALO", r["transferred"] ?? 0],
    ["Completed", r["completed"] ?? 0],
    ["Failed", r["failed"] ?? 0],
    ["Expired", r["expired"] ?? 0],
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Higher Education — Admin Overview"
        subtitle="ALAMINN.INFO Higher Study is the public discovery layer; ALO Education is the source of truth for applications and education services. Students hand off through the signed, consent-tracked referral pipeline — never through duplicated records."
      />

      <Card className="mb-6">
        <CardHeader><CardTitle className="flex items-center gap-2">ALO Education (source of truth) {aloBadge}</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {!alo ? (
            <p className="text-muted-foreground">The ALO Education integration is not registered. Referral routing is still auditable in the database, but connection status is unavailable.</p>
          ) : (
            <>
              <p className="text-muted-foreground">
                {alo.lastTestMessage || "No connection test has been run yet. Run the connection test from the Integrations page to verify the referral destination endpoints are reachable."}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Last test: {alo.lastTestAt ? fmtDate(alo.lastTestAt) : "never"} · Configured: {alo.configured ? "yes" : "no"} ·{" "}
                <Link href="/admin/integrations" className="underline">Test connection in Integrations</Link>
              </p>
            </>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Referral handoffs are recorded and retried regardless of live routing status — nothing is lost when ALO Education is briefly unreachable.
          </p>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Referral pipeline → ALO Education</h2>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        {referralCards.map(([k, v]) => (
          <Card key={k}>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">{k}</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold">{v}</p></CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Public discovery catalogue</h2>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[["Universities", d.catalogue.universities], ["Courses", d.catalogue.courses], ["Scholarships", d.catalogue.scholarships], ["Supervisors", d.catalogue.supervisors], ["Research projects", d.catalogue.researchProjects]].map(([k, v]) => (
          <Card key={String(k)}>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">{k}</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold">{v}</p></CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Weekly monitoring</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {d.monitoring ? (
            <>
              Status: {d.monitoring.status} · Last run: {fmtDate(d.monitoring.completedAt || d.monitoring.startedAt)} · Next run: {d.monitoring.nextRunAt ? fmtDate(d.monitoring.nextRunAt) : "—"} · Sources checked: {d.monitoring.sourcesChecked} · Failed: {d.monitoring.sourcesFailed} · Changes detected: {d.monitoring.changesDetected}
            </>
          ) : (
            "No monitoring run has completed yet — an empty history is a valid result, not missing data."
          )}
          <div className="mt-2"><Link href="/admin/higher-study/monitoring" className="underline">Open Data Monitoring</Link></div>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Manage the catalogue</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="rounded-lg border p-4 transition-colors hover:bg-muted/40">
            <p className="font-medium">{s.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

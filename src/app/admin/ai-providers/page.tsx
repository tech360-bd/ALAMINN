"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, KeyRound, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, ErrorState } from "@/components/admin/page-primitives";
import { adminFetch } from "@/components/admin/lib";

type ProviderRow = {
  id: string;
  name: string;
  enabled: boolean;
  configured: boolean;
  keySource: "db" | "env" | "none";
  maskedKey: string;
  baseUrl: string;
  customModel: string;
};

type TelemetryProvider = {
  calls?: number;
  successes?: number;
  failures?: number;
  rateLimits?: number;
  avgLatencyMs?: number;
  inCooldown?: boolean;
  lastUsedAt?: string | null;
  lastError?: string | null;
};

type ProviderData = {
  providers: ProviderRow[];
  global: {
    preferredProvider: string;
    fallbackOrder: string[];
    cacheEnabled: boolean;
    smartTierRouting: boolean;
  };
  telemetry: { providers: Record<string, TelemetryProvider>; cacheHits?: number; cacheMisses?: number };
};

export default function AiProvidersPage() {
  const [data, setData] = useState<ProviderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const env = await adminFetch<ProviderData>("/api/v1/admin/ai-agent/providers");
      setData(env.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load provider registry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void load(); });
    return () => { cancelled = true; };
  }, [load]);

  if (error && !data) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader
        title="AI Provider Gateway"
        subtitle="Registered providers, masked credentials and live router telemetry"
        actions={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Refresh
          </button>
        }
      />

      {!data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading provider registry…</div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card><CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Preferred provider</p>
              <p className="mt-1 text-lg font-semibold">{data.global.preferredProvider}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Configured providers</p>
              <p className="mt-1 text-lg font-semibold">{data.providers.filter((p) => p.configured).length} / {data.providers.length}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Router cache</p>
              <p className="mt-1 text-lg font-semibold">{data.telemetry.cacheHits ?? 0} hits · {data.telemetry.cacheMisses ?? 0} misses</p>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> Provider registry</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="py-2">Provider</th><th>Status</th><th>Key</th><th>Calls</th><th>Success</th><th>Failures</th><th>Latency</th></tr>
                  </thead>
                  <tbody>
                    {data.providers.map((provider) => {
                      const metrics = data.telemetry.providers?.[provider.id] ?? {};
                      const status = !provider.configured
                        ? "Awaiting credentials"
                        : metrics.inCooldown
                          ? "Cooldown"
                          : (metrics.failures ?? 0) > (metrics.successes ?? 0)
                            ? "Degraded"
                            : "Available";
                      return (
                        <tr key={provider.id} className="border-t align-top">
                          <td className="py-2">
                            <p className="font-medium">{provider.name}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{provider.id}</p>
                          </td>
                          <td><Badge variant={status === "Available" ? "default" : "outline"}>{status}</Badge></td>
                          <td className="font-mono text-xs">{provider.maskedKey || "—"}</td>
                          <td>{metrics.calls ?? 0}</td>
                          <td>{metrics.successes ?? 0}</td>
                          <td>{metrics.failures ?? 0}</td>
                          <td>{metrics.avgLatencyMs ? `${metrics.avgLatencyMs} ms` : "Unavailable"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Credentials are AES-256-GCM encrypted at rest and only masked values are shown here.
            <Activity className="ml-2 h-3.5 w-3.5" /> Zero calls means no verified connection yet — never treat a saved key as a working integration.
          </p>
        </div>
      )}
    </div>
  );
}

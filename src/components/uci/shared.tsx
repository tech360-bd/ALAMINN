"use client";

import { Badge } from "@/components/ui/badge";
import { STATUS_STYLES } from "@/lib/uci/verification";

export function VerificationBadge({ status, small }: { status: string; small?: boolean }) {
  const style = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <Badge variant="outline" className={`${style} ${small ? "text-[10px] px-1.5 py-0" : "text-xs"} font-medium whitespace-nowrap`}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

export function SourceLevelBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    OFFICIAL: "bg-emerald-50 text-emerald-800 border-emerald-200",
    PLATFORM: "bg-sky-50 text-sky-800 border-sky-200",
    PUBLIC: "bg-slate-100 text-slate-700 border-slate-200",
    INTERNAL: "bg-amber-50 text-amber-800 border-amber-200",
  };
  return (
    <Badge variant="outline" className={`${map[level] ?? ""} text-xs font-medium`}>
      {level === "OFFICIAL" ? "Level 1 · Official" : level === "PLATFORM" ? "Level 2 · Platform" : level === "PUBLIC" ? "Level 3 · Public" : "Internal evidence"}
    </Badge>
  );
}

/** Friendly label for captured field keys. */
export function fieldLabel(k: string): string {
  return k
    .replace(/_/g, " ")
    .replace(/\bug\b/gi, "Undergraduate")
    .replace(/\bpg\b/gi, "Postgraduate")
    .replace(/\bhsc\b/gi, "HSC")
    .replace(/\bmoi\b/gi, "MOI")
    .replace(/\bci method\b/gi, "Credibility Interview")
    .replace(/\bcas\b/gi, "CAS")
    .replace(/\bllt\b/gi, "LLT")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** Renders dates as plain UTC dates; unknown stays unknown. */
export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    return new Date(v).toISOString().slice(0, 10);
  } catch {
    return v;
  }
}

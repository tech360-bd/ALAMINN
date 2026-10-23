/**
 * ALO University & Official Data Monitoring Agent — detection engine.
 * Pure helpers (hash/extract/classify/diff) are unit-tested. The agent
 * NEVER mutates catalogue rows: it writes snapshots + pending changes
 * for Super Admin approval. Unknown fields stay null (NOT_PUBLISHED).
 */
import { createHash } from "crypto";
export function contentHash(html: string): string {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return createHash("sha256").update(text).digest("hex");
}
export type Signals = { title: string | null; fees: string[]; deadlines: string[]; ielts: string | null; closed: boolean };
export function extractSignals(html: string): Signals {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || null;
  const fees = [...new Set((text.match(/(?:£|\$|€|AUD|NZD|CAD|USD|GBP)\s?[\d,]{3,}(?:\.\d{2})?/g) || []).slice(0, 8))];
  const deadlines = [...new Set((text.match(/\b\d{1,2}\s(?:January|February|March|April|May|June|July|August|September|October|November|December)\s20\d{2}\b/g) || []).slice(0, 8))];
  const ielts = text.match(/IELTS[^.]{0,60}?(\d\.\d)/i)?.[0]?.slice(0, 80) || null;
  return { title, fees, deadlines, ielts, closed: /course (closed|no longer (available|accepting)|discontinued)/i.test(text) };
}
export type ChangeDraft = { changeType: string; impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; field: string; oldValue: string | null; newValue: string | null; confidence: number; aiSummary: string };
export function diffSignals(prev: Signals | null, next: Signals, sourceType: string): ChangeDraft[] {
  if (!prev) return [{ changeType: "SOURCE_CHANGED", impact: "LOW", field: "baseline", oldValue: null, newValue: "First snapshot captured — baseline established, no facts asserted.", confidence: 1, aiSummary: "Baseline snapshot. Nothing published from this alone." }];
  const out: ChangeDraft[] = [];
  const j = (a: string[]) => a.join(", ");
  if (j(prev.fees) !== j(next.fees) && (prev.fees.length || next.fees.length)) out.push({ changeType: "FEE_CHANGED", impact: "HIGH", field: "tuitionFee", oldValue: j(prev.fees) || null, newValue: j(next.fees) || null, confidence: 0.7, aiSummary: `Fee figures on the official page changed: ${j(prev.fees) || "none found"} → ${j(next.fees) || "none found"}. Verify basis (annual/total) before approving.` });
  if (j(prev.deadlines) !== j(next.deadlines) && (prev.deadlines.length || next.deadlines.length)) out.push({ changeType: "DEADLINE_CHANGED", impact: "HIGH", field: "applicationDeadline", oldValue: j(prev.deadlines) || null, newValue: j(next.deadlines) || null, confidence: 0.7, aiSummary: "Application deadline text changed on the official source." });
  if ((prev.ielts || "") !== (next.ielts || "")) out.push({ changeType: "ENGLISH_REQUIREMENT_CHANGED", impact: "HIGH", field: "englishRequirements", oldValue: prev.ielts, newValue: next.ielts, confidence: 0.65, aiSummary: "English-language requirement text changed." });
  if (!prev.closed && next.closed) out.push({ changeType: "COURSE_CLOSED", impact: "CRITICAL", field: "courseStatus", oldValue: "available", newValue: "closed signal detected", confidence: 0.6, aiSummary: "Page now signals closure/discontinuation — manual confirmation required." });
  if (out.length === 0) out.push({ changeType: "SOURCE_CHANGED", impact: "LOW", field: "content", oldValue: "previous snapshot", newValue: "content changed (no fee/deadline/English signal)", confidence: 0.5, aiSummary: "Page content changed without a detected fee, deadline or English-requirement signal." });
  if (sourceType === "government" || sourceType === "immigration") for (const c of out) { c.changeType = "GOVERNMENT_POLICY_CHANGE"; c.impact = "CRITICAL"; }
  return out;
}
/** Dedup key per spec: UNIVERSITY + OFFICIAL COURSE CODE, fallback UNIVERSITY + NORMALIZED URL. */
export function courseDedupKey(universitySlug: string, courseCode: string | null, officialUrl: string | null, title: string): string {
  if (courseCode) return `${universitySlug}::code::${courseCode.trim().toUpperCase()}`;
  if (officialUrl) return `${universitySlug}::url::${officialUrl.toLowerCase().replace(/\/$/, "")}`;
  return `${universitySlug}::title::${title.toLowerCase().replace(/\s+/g, " ").trim()}`;
}
export const APPROVABLE_FIELDS: Record<string, string[]> = {
  course: ["tuitionFee", "applicationDeadline", "englishRequirements", "academicEntryRequirements", "duration", "studyMode"],
  university: ["tuitionFeeRange", "applicationDeadlines", "ieltsRequirement", "academicEntryRequirements"],
  scholarship: ["fundingAmount", "eligibilityCriteria"],
};

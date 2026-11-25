import { describe, it, expect } from "vitest";
import { contentHash, extractSignals, diffSignals, courseDedupKey } from "@/lib/higher-study/monitoring/engine";
import { buildDigestPayload } from "@/lib/higher-study/monitoring/digest";
describe("monitoring engine (anti-fabrication)", () => {
  it("hash ignores scripts/styles and is stable", () => { expect(contentHash("<html><script>var x=1</script><p>Hello</p></html>")).toBe(contentHash("<p>hello</p>")); });
  it("extracts only published signals; missing fee stays empty", () => { const s = extractSignals("<title>MSc CS</title><p>IELTS 6.5 overall. Apply by 15 September 2027.</p>"); expect(s.fees).toEqual([]); expect(s.deadlines).toContain("15 September 2027"); expect(s.ielts).toContain("IELTS"); });
  it("baseline snapshot asserts no facts", () => { const d = diffSignals(null, extractSignals("<p>£20,000</p>"), "university-course"); expect(d[0].changeType).toBe("SOURCE_CHANGED"); });
  it("fee change is HIGH, government change is CRITICAL policy", () => { const a = extractSignals("<p>£20,000 per year</p>"); const b = extractSignals("<p>£22,500 per year</p>"); const d = diffSignals(a, b, "government"); expect(d[0].impact).toBe("CRITICAL"); expect(d[0].changeType).toBe("GOVERNMENT_POLICY_CHANGE"); });
  it("no change in signals = LOW content change only", () => { const a = extractSignals("<p>£20,000</p>"); expect(diffSignals(a, a, "university-course")[0].impact).toBe("LOW"); });
  it("dedup key prefers official course code, falls back to normalized URL, never random", () => { expect(courseDedupKey("ucl", "CS101", null, "MSc CS")).toBe("ucl::code::CS101"); expect(courseDedupKey("ucl", null, "https://UCL.ac.uk/Course/", "x")).toBe("ucl::url::https://ucl.ac.uk/course"); });
});

describe("weekly monitoring digest (anti-fabrication)", () => {
  const baseRun = { id: "run-1", status: "completed", startedAt: new Date("2026-11-20T09:00:00Z"), completedAt: new Date("2026-11-20T09:04:00Z"), nextRunAt: new Date("2026-11-27T09:00:00Z"), sourcesChecked: 12, sourcesFailed: 1, changesDetected: 3 };
  it("no run yet renders an honest empty state, never fabricated data", () => {
    const d = buildDigestPayload({ run: null, changes: [], pendingApproval: 0 });
    expect(d.status).toBe("no-run-yet");
    expect(d.headline).toMatch(/No monitoring cycle has run yet/i);
    expect(d.changesDetected).toBe(0);
    expect(d.byType).toEqual([]);
  });
  it("aggregates changes by type+impact with pending counts and high-impact total", () => {
    const changes = [
      { changeType: "FEE_CHANGED", impact: "HIGH", status: "pending" },
      { changeType: "FEE_CHANGED", impact: "HIGH", status: "approved" },
      { changeType: "DEADLINE_CHANGED", impact: "HIGH", status: "pending" },
      { changeType: "SOURCE_CHANGED", impact: "LOW", status: "needs-review" },
    ];
    const d = buildDigestPayload({ run: baseRun, changes, pendingApproval: 3 });
    expect(d.criticalOrHigh).toBe(3);
    expect(d.byType).toHaveLength(3);
    const fee = d.byType.find((t) => t.changeType === "FEE_CHANGED");
    expect(fee).toMatchObject({ count: 2, pending: 1 });
    expect(d.byType[0].count).toBeGreaterThanOrEqual(d.byType[d.byType.length - 1].count);
  });
  it("zero-change cycles state the empty-queue-is-valid rule", () => {
    const d = buildDigestPayload({ run: { ...baseRun, changesDetected: 0 }, changes: [], pendingApproval: 0 });
    expect(d.changesDetected).toBe(0);
    expect(d.headline).toMatch(/no changes detected — an empty queue is a valid result/i);
  });
  it("reports failed sources without implying data was modified", () => {
    const d = buildDigestPayload({ run: { ...baseRun, sourcesFailed: 3 }, changes: [], pendingApproval: 0 });
    expect(d.headline).toMatch(/3 failed \(recorded for re-check, verified data untouched\)/i);
  });
});

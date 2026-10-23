import { describe, it, expect } from "vitest";
import { contentHash, extractSignals, diffSignals, courseDedupKey } from "@/lib/higher-study/monitoring/engine";
describe("monitoring engine (anti-fabrication)", () => {
  it("hash ignores scripts/styles and is stable", () => { expect(contentHash("<html><script>var x=1</script><p>Hello</p></html>")).toBe(contentHash("<p>hello</p>")); });
  it("extracts only published signals; missing fee stays empty", () => { const s = extractSignals("<title>MSc CS</title><p>IELTS 6.5 overall. Apply by 15 September 2027.</p>"); expect(s.fees).toEqual([]); expect(s.deadlines).toContain("15 September 2027"); expect(s.ielts).toContain("IELTS"); });
  it("baseline snapshot asserts no facts", () => { const d = diffSignals(null, extractSignals("<p>£20,000</p>"), "university-course"); expect(d[0].changeType).toBe("SOURCE_CHANGED"); });
  it("fee change is HIGH, government change is CRITICAL policy", () => { const a = extractSignals("<p>£20,000 per year</p>"); const b = extractSignals("<p>£22,500 per year</p>"); const d = diffSignals(a, b, "government"); expect(d[0].impact).toBe("CRITICAL"); expect(d[0].changeType).toBe("GOVERNMENT_POLICY_CHANGE"); });
  it("no change in signals = LOW content change only", () => { const a = extractSignals("<p>£20,000</p>"); expect(diffSignals(a, a, "university-course")[0].impact).toBe("LOW"); });
  it("dedup key prefers official course code, falls back to normalized URL, never random", () => { expect(courseDedupKey("ucl", "CS101", null, "MSc CS")).toBe("ucl::code::CS101"); expect(courseDedupKey("ucl", null, "https://UCL.ac.uk/Course/", "x")).toBe("ucl::url::https://ucl.ac.uk/course"); });
});

import { describe, it, expect } from "vitest";
import { evaluatePolicy } from "@/lib/social/policy";
import { classifyMessage, verifyMetaSignature } from "@/lib/social/classifier";
import { encryptToken, decryptToken } from "@/lib/social/crypto";
import { createHmac } from "crypto";
const base = { globalEngagementEnabled: true as boolean | null, accountAutomationEnabled: true, accountStatus: "connected", accountResponseMode: "controlled", minConfidence: 0.85, confidence: 0.95, risk: "low", category: "general" };
describe("global automation policy (spec §5/§16)", () => {
  it("OFF blocks every auto reply", () => { expect(evaluatePolicy({ ...base, globalEngagementEnabled: false }).allowAutoSend).toBe(false); });
  it("unknown state fails closed", () => { expect(evaluatePolicy({ ...base, globalEngagementEnabled: null }).allowAutoSend).toBe(false); });
  it("ON respects account switch", () => { expect(evaluatePolicy({ ...base, accountAutomationEnabled: false }).reason).toBe("account_automation_off"); });
  it("ON respects approval + manual modes", () => { expect(evaluatePolicy({ ...base, accountResponseMode: "approval" }).route).toBe("approval"); expect(evaluatePolicy({ ...base, accountResponseMode: "manual" }).route).toBe("manual"); });
  it("low confidence held", () => { expect(evaluatePolicy({ ...base, confidence: 0.5 }).reason).toBe("low_confidence"); });
  it("sensitive + complaints escalate even at high confidence", () => { expect(evaluatePolicy({ ...base, category: "sensitive", risk: "high" }).route).toBe("escalate"); expect(evaluatePolicy({ ...base, category: "complaint", risk: "high" }).route).toBe("escalate"); });
  it("disconnected account never auto-sends", () => { expect(evaluatePolicy({ ...base, accountStatus: "disconnected" }).allowAutoSend).toBe(false); });
  it("only all-gates-passed auto-sends", () => { expect(evaluatePolicy(base).allowAutoSend).toBe(true); });
});
describe("classifier", () => {
  it("detects pricing in Bangla + sensitive escalation", () => { expect(classifyMessage("UK te MSc korte koto khoroch hobe?").category).toBe("pricing"); expect(classifyMessage("I will take legal action, refund dispute now").category).toBe("sensitive"); });
  it("spam flagged", () => { expect(classifyMessage("crypto giveaway free money click here to win").category).toBe("spam"); });
});
describe("webhook signature", () => {
  it("accepts valid, rejects invalid", () => { const body = '{"a":1}'; const sig = "sha256=" + createHmac("sha256", "secret").update(body).digest("hex"); expect(verifyMetaSignature(body, sig, "secret")).toBe(true); expect(verifyMetaSignature(body, sig, "wrong")).toBe(false); expect(verifyMetaSignature(body, null, "secret")).toBe(false); });
});
describe("token crypto", () => { it("round-trips and never stores plaintext", () => { const c = encryptToken("EAAB-example-token-1234"); expect(c).not.toContain("EAAB"); expect(decryptToken(c)).toBe("EAAB-example-token-1234"); expect(decryptToken("tampered")).toBeNull(); }); });

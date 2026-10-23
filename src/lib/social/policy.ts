/**
 * Centralized automation policy — the ONLY place that may authorize an
 * automated outbound reply/publish. Fail-closed: any unknown state = deny.
 * `evaluatePolicy` is pure (unit-testable); `assertAutomationAllowedNow`
 * re-reads the DB immediately before a send (race guard, spec §5).
 */
export type PolicyInput = {
  globalEngagementEnabled: boolean | null; // null = state row missing/unreadable
  accountAutomationEnabled: boolean;
  accountStatus: string;
  accountResponseMode: string; // manual | approval | controlled
  ruleAction?: string | null; // auto_reply | approval | escalate | ignore
  ruleEnabled?: boolean;
  minConfidence: number;
  confidence: number;
  risk: string; // low | medium | high
  category: string;
  requiresApprovalCategories?: string[];
};
export type PolicyVerdict = { allowAutoSend: boolean; route: "auto" | "approval" | "escalate" | "manual" | "ignore"; reason: string };
const HIGH_RISK = new Set(["complaint", "sensitive", "human-required"]);
export function evaluatePolicy(i: PolicyInput): PolicyVerdict {
  if (i.globalEngagementEnabled !== true) return { allowAutoSend: false, route: "approval", reason: "global_automation_off_or_unknown" };
  if (i.accountStatus !== "connected") return { allowAutoSend: false, route: "approval", reason: "account_not_connected" };
  if (!i.accountAutomationEnabled) return { allowAutoSend: false, route: "approval", reason: "account_automation_off" };
  if (i.ruleEnabled === false) return { allowAutoSend: false, route: "approval", reason: "rule_disabled" };
  if (i.ruleAction === "ignore") return { allowAutoSend: false, route: "ignore", reason: "rule_ignore" };
  if (i.ruleAction === "escalate" || HIGH_RISK.has(i.category) || i.risk === "high") return { allowAutoSend: false, route: "escalate", reason: "high_risk_category" };
  if ((i.requiresApprovalCategories || []).includes(i.category)) return { allowAutoSend: false, route: "approval", reason: "category_requires_approval" };
  if (i.accountResponseMode === "manual") return { allowAutoSend: false, route: "manual", reason: "account_mode_manual" };
  if (i.accountResponseMode === "approval" || i.ruleAction === "approval") return { allowAutoSend: false, route: "approval", reason: "approval_mode" };
  if (i.confidence < i.minConfidence) return { allowAutoSend: false, route: "approval", reason: "low_confidence" };
  if (i.risk !== "low") return { allowAutoSend: false, route: "approval", reason: "risk_not_low" };
  return { allowAutoSend: true, route: "auto", reason: "all_gates_passed" };
}

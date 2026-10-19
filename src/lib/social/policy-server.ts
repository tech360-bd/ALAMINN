import { db } from "@/lib/db";
import { evaluatePolicy, type PolicyVerdict } from "./policy";
export async function getGlobalState() {
  try { return await db.socialAutomationState.upsert({ where: { id: "global" }, create: { id: "global" }, update: {} }); }
  catch { return null; }
}
/** Final-send-boundary recheck. Returns verdict + observed switch version. */
export async function assertAutomationAllowedNow(opts: { accountId: string; category: string; confidence: number; risk: string }): Promise<{ verdict: PolicyVerdict; version: number | null }> {
  const [state, account, rule] = await Promise.all([
    getGlobalState(),
    db.socialAccount.findUnique({ where: { id: opts.accountId } }).catch(() => null),
    db.socialAutomationRule.findFirst({ where: { enabled: true, OR: [{ accountId: opts.accountId }, { accountId: null }] }, orderBy: { createdAt: "asc" } }).catch(() => null),
  ]);
  if (!account) return { verdict: { allowAutoSend: false, route: "approval", reason: "account_missing" }, version: state?.version ?? null };
  const verdict = evaluatePolicy({
    globalEngagementEnabled: state ? state.engagementEnabled : null,
    accountAutomationEnabled: account.automationEnabled, accountStatus: account.status,
    accountResponseMode: account.responseMode, ruleAction: rule?.action, ruleEnabled: rule?.enabled,
    minConfidence: rule?.minConfidence ?? 0.85, confidence: opts.confidence, risk: opts.risk, category: opts.category,
  });
  return { verdict, version: state?.version ?? null };
}

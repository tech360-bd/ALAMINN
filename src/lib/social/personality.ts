import { db } from "@/lib/db";
import { applySafetyGuardrails } from "@/lib/whatsapp/agent";
const parse = (s: string | null, fb: unknown) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
export async function getProfileForAccount(accountId: string) {
  const acc = await db.socialAccount.findUnique({ where: { id: accountId } }).catch(() => null);
  if (acc?.aiProfileId) { const p = await db.aiPersonalityProfile.findUnique({ where: { id: acc.aiProfileId } }).catch(() => null); if (p) return p; }
  return db.aiPersonalityProfile.findFirst({ where: { isDefault: true } }).catch(() => null);
}
/** Keyword retrieval over APPROVED knowledge only — never unapproved content. */
export async function retrieveApprovedKnowledge(query: string): Promise<{ id: string; title: string; content: string }[]> {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3).slice(0, 8);
  const rows = await db.socialKnowledgeSource.findMany({ where: { approved: true }, take: 50, orderBy: { updatedAt: "desc" } }).catch(() => []);
  return rows.map((r) => ({ r, score: words.reduce((n, w) => n + (r.content.toLowerCase().includes(w) || r.title.toLowerCase().includes(w) ? 1 : 0), 0) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map((x) => ({ id: x.r.id, title: x.r.title, content: x.r.content.slice(0, 1200) }));
}
export function buildSystemPrompt(p: Awaited<ReturnType<typeof getProfileForAccount>>, platform: string): string {
  if (!p) return "You are Alaminn AI, a helpful assistant. Never invent prices, guarantees, or policies. If unsure, offer a human counselor.";
  const styles = parse(p.platformStyles, {}) as Record<string, string>;
  return [`Identity: ${p.identity || "Al-Amin"}`, `Brand: ${p.brandContext || ""}`, `Languages: ${p.languages} — reply in the customer's language.`, `Formality ${p.formality}/5, friendliness ${p.friendliness}/5. Sentence style: ${p.sentenceStyle || "balanced"}.`,
    p.greeting ? `Greeting style: ${p.greeting}` : "", p.signOff ? `Sign-off: ${p.signOff}` : "",
    `Preferred phrases: ${(parse(p.preferredPhrases, []) as string[]).join("; ")}`, `NEVER use: ${(parse(p.avoidPhrases, []) as string[]).join("; ")}`,
    `Service principles: ${p.servicePrinciples || ""}`, `Business hours: ${p.businessHours || "n/a"} Escalation: ${p.escalationContact || "human team"}`,
    `Platform style (${platform}): ${styles[platform] || "concise and professional"}`, `NEVER answer without approval: ${(parse(p.neverAnswerTopics, []) as string[]).join("; ")}`,
    "Ground every factual claim in the APPROVED KNOWLEDGE provided. Never invent prices, admission/visa/scholarship guarantees, or policies. You are an AI assistant — never claim Al-Amin personally wrote this."].filter(Boolean).join("\n");
}
export async function generateSocialReply(opts: { profile: Awaited<ReturnType<typeof getProfileForAccount>>; platform: string; message: string; knowledge: { title: string; content: string }[] }): Promise<{ text: string; modelUsed: string }> {
  const faqs = parse(opts.profile?.faqs, []) as { q: string; a: string }[];
  const hit = faqs.find((f) => opts.message.toLowerCase().includes(f.q.toLowerCase().slice(0, 12)));
  try {
    const ZAI = await import("z-ai-web-dev-sdk").catch(() => null);
    if (ZAI?.default) {
      const zai = await ZAI.default.create();
      const kb = opts.knowledge.length ? opts.knowledge.map((k) => `[${k.title}] ${k.content}`).join("\n") : "No approved knowledge matched. Do not invent facts; offer a human counselor.";
      const examples = (parse(opts.profile?.examplePairs, []) as { incoming: string; approvedReply: string }[]).slice(0, 3).map((e) => `Example Q: ${e.incoming}\nApproved style: ${e.approvedReply}`).join("\n");
      const c = await zai.chat.completions.create({ messages: [{ role: "system", content: buildSystemPrompt(opts.profile, opts.platform) }, { role: "system", content: `APPROVED KNOWLEDGE:\n${kb}\n${examples}` }, { role: "user", content: opts.message }], temperature: 0.4, max_tokens: 500 });
      const text = c?.choices?.[0]?.message?.content?.trim();
      if (text) return { text: applySafetyGuardrails(text), modelUsed: process.env.WHATSAPP_AI_MODEL || "glm-4.6" };
    }
  } catch { /* fall through to grounded fallback */ }
  if (hit) return { text: applySafetyGuardrails(hit.a), modelUsed: "faq-fallback" };
  if (opts.knowledge.length) return { text: applySafetyGuardrails(`${opts.profile?.greeting ? opts.profile.greeting + " " : ""}Thank you for your message. Based on our approved information: ${opts.knowledge[0].content.slice(0, 500)} ${opts.profile?.signOff || ""}`.trim()), modelUsed: "knowledge-fallback" };
  return { text: "Thank you for your message. I don't have verified information on that yet — I've passed it to our team, who will reply shortly.", modelUsed: "safe-fallback" };
}

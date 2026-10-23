/** Deterministic message classification + risk. Pure — unit tested. */
export type SocialCategory = "general" | "service" | "lead" | "appointment" | "complaint" | "spam" | "sensitive" | "pricing" | "human-required";
const R: [SocialCategory, RegExp][] = [
  ["sensitive", /\b(password|otp|pin|cvv|bank account|passport number|legal action|lawsuit|lawyer|refund dispute|harass|threat)\b/i],
  ["complaint", /\b(complaint|scam|fraud|cheated|worst|terrible service|not responding|refund)\b/i],
  ["spam", /(crypto giveaway|free money|click here to win|casino|betting bonus)/i],
  ["appointment", /\b(book|appointment|consultation|meeting|schedule a call|visit office)\b/i],
  ["pricing", /\b(price|cost|fee|fees|tuition|charge|discount|payment|khoroch|koto taka|dam|খরচ|ফি|দাম|কত টাকা)\b/i],
  ["lead", /\b(i want to apply|admission|enroll|study in|ielts|university|course|scholarship|আবেদন|ভর্তি)\b/i],
  ["service", /\b(how|what|when|where|document|requirement|process|help|জানতে চাই)\b/i],
];
export function classifyMessage(text: string): { category: SocialCategory; confidence: number; risk: "low" | "medium" | "high"; language: string } {
  const t = text.trim();
  const language = /[\u0980-\u09FF]/.test(t) ? (/(the|is|and|please)/i.test(t) ? "banglish" : "bn") : "en";
  if (/^(hi|hello|hey|salam|assalamu)/i.test(t) && t.length < 60) return { category: "general", confidence: 0.95, risk: "low", language };
  for (const [cat, re] of R) if (re.test(t)) {
    const risk = cat === "sensitive" || cat === "complaint" ? "high" : cat === "pricing" || cat === "lead" ? "medium" : "low";
    return { category: cat, confidence: cat === "service" ? 0.7 : 0.88, risk, language };
  }
  return { category: "general", confidence: t.length > 20 ? 0.6 : 0.45, risk: "medium", language };
}
export function verifyMetaSignature(rawBody: string, signature: string | null, appSecret: string | null): boolean {
  if (!signature || !appSecret) return false;
  const { createHmac, timingSafeEqual } = require("crypto") as typeof import("crypto");
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

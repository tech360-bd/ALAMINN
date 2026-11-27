import { z } from "zod";

export const DOCUMENT_KINDS = ["diagram", "humanizer", "storyboard", "email-template"] as const;
export type DocumentKind = typeof DOCUMENT_KINDS[number];
export const diagramSchema = z.object({
  nodes: z.array(z.object({ id: z.string().min(1).max(80), label: z.string().min(1).max(100), x: z.number().finite().min(0).max(5000), y: z.number().finite().min(0).max(5000), color: z.enum(["blue", "orange", "green", "slate"]).default("blue") })).min(1).max(40),
  edges: z.array(z.object({ from: z.string().max(80), to: z.string().max(80), label: z.string().max(80).optional() })).max(80),
}).superRefine((d, ctx) => {
  const ids = new Set(d.nodes.map(n => n.id));
  if (ids.size !== d.nodes.length) ctx.addIssue({ code: "custom", message: "Node IDs must be unique" });
  if (d.edges.some(e => !ids.has(e.from) || !ids.has(e.to) || e.from === e.to)) ctx.addIssue({ code: "custom", message: "Edges must connect two different existing nodes" });
});
export type Diagram = z.infer<typeof diagramSchema>;
export const sceneSchema = z.object({ id: z.string().max(80), title: z.string().min(1).max(120), description: z.string().min(1).max(2000), dialogue: z.string().max(3000).default(""), durationSeconds: z.number().int().min(1).max(120), shot: z.string().max(100).default("Medium shot") });
export const storyboardSchema = z.object({ scenes: z.array(sceneSchema).min(1).max(30) }).superRefine((d, ctx) => { if (new Set(d.scenes.map(s => s.id)).size !== d.scenes.length) ctx.addIssue({ code: "custom", message: "Scene IDs must be unique" }); });
export type Storyboard = z.infer<typeof storyboardSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export const emailContentSchema = z.object({ subject: z.string().min(1).max(180), preheader: z.string().max(200).default(""), bodyText: z.string().min(1).max(20000), ctaLabel: z.string().max(80).default(""), ctaUrl: z.string().max(1000).default(""), accent: z.enum(["blue", "orange"]).default("blue"), bodyHtmlOverride: z.string().max(300000).default("") }).superRefine((d, ctx) => { if (d.ctaUrl && !/^https:\/\//i.test(d.ctaUrl)) ctx.addIssue({ code: "custom", message: "CTA links must use HTTPS", path: ["ctaUrl"] }); if (!!d.ctaLabel !== !!d.ctaUrl) ctx.addIssue({ code: "custom", message: "Provide both a CTA label and URL, or neither" }); });
export type EmailContent = z.infer<typeof emailContentSchema>;
export const documentSchema = z.object({ kind: z.enum(DOCUMENT_KINDS), title: z.string().trim().min(1).max(160), content: z.string().max(100000), metadata: z.string().max(4000).optional() }).superRefine((d, ctx) => {
  if (d.kind === "humanizer") return;
  try { const value = JSON.parse(d.content); const result = (d.kind === "diagram" ? diagramSchema : d.kind === "storyboard" ? storyboardSchema : emailContentSchema).safeParse(value); if (!result.success) ctx.addIssue({ code: "custom", message: result.error.issues[0].message }); } catch { ctx.addIssue({ code: "custom", message: "Invalid document content" }); }
});
export const generateSchema = z.object({ kind: z.enum(["diagram", "humanizer", "storyboard", "email"]), prompt: z.string().trim().min(5).max(16000), tone: z.enum(["natural", "professional", "friendly", "concise"]).default("natural") });
export const campaignFields = z.object({ name: z.string().trim().min(2).max(160), objective: z.string().max(2000).default(""), audience: z.string().max(1000).default(""), brief: z.string().max(10000).default(""), budget: z.number().int().min(0).max(100000000).default(0), currency: z.enum(["USD", "BDT", "EUR", "GBP"]).default("USD"), channels: z.array(z.enum(["email", "facebook", "instagram", "website", "linkedin"])).max(5).default([]), startsAt: z.string().datetime().nullable().default(null), endsAt: z.string().datetime().nullable().default(null), status: z.enum(["draft", "active", "paused", "completed"]).default("draft"), utmCampaign: z.string().regex(/^[a-zA-Z0-9_-]{0,100}$/).default("") });
export const campaignSchema = campaignFields.refine(d => !d.startsAt || !d.endsAt || d.endsAt > d.startsAt, { message: "End date must follow start date" });
export const emailCampaignSchema = emailContentSchema.extend({ name: z.string().trim().min(2).max(160), audience: z.string().max(100).default("all"), campaignId: z.string().max(80).nullable().default(null), scheduledAt: z.string().datetime().nullable().default(null) });
export const PIPELINE_STAGES = ["new", "qualified", "proposal-sent", "negotiation", "won", "lost"] as const;
export const dealSchema = z.object({ title: z.string().trim().min(2).max(180), contactId: z.string().max(80).optional(), contactName: z.string().max(160).optional(), contactEmail: z.string().email().max(254).optional(), value: z.number().int().min(0).max(100000000).default(0), currency: z.enum(["USD", "BDT", "EUR", "GBP"]).default("USD"), stage: z.enum(PIPELINE_STAGES).default("new"), closeDate: z.string().datetime().nullable().default(null) });
export function stageGroup(stage: string): string {
  if (["review-required"].includes(stage)) return "new";
  if (["discovery-scheduled", "discovery-completed", "scope-required"].includes(stage)) return "qualified";
  if (["proposal-drafting"].includes(stage)) return "proposal-sent";
  if (["approved", "in-progress"].includes(stage)) return "negotiation";
  if (["on-hold", "archived"].includes(stage)) return "lost";
  return PIPELINE_STAGES.includes(stage as typeof PIPELINE_STAGES[number]) ? stage : "new";
}

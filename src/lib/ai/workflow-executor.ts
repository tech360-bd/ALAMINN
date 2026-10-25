/**
 * Governed Executive AI Workflow Executor (100% Free AI Router)
 * =============================================================
 * Executes any `AiTask` workflow immediately over the Free AI Router
 * (Groq → Gemini → Cerebras → OpenRouter :free → GitHub → Pollinations →
 * Ollama → ZAI → Grounded Local Synthesis) and advances task status to
 * `awaiting-approval` (if approvalRequired) or `delivered`.
 */

import { db } from "@/lib/db";
import { runFreeAiRouter } from "./free-router";
import type { FreeProviderId, ModelSpeedTier } from "./free-providers";

export const WORKFLOW_PROMPTS: Record<string, string> = {
  "executive-linkedin-post":
    "You are an executive ghostwriter for Al Aminn, a senior operator who transforms strategy into scalable operations. Draft a LinkedIn post (max 1,200 chars) in his voice: confident, concrete, no buzzword salad. Include a hook, 2-3 substantive paragraphs, and a closing question. No hashtags unless asked.",
  "seo-article-draft":
    "You are an SEO content strategist drafting an article for alaminn.info. Produce a well-structured markdown article (800-1,200 words) with H2/H3 headings, a compelling intro, actionable body, and a CTA. Target keyword should appear naturally in title, first paragraph, and one H2. No fluff.",
  "newsletter-draft":
    "You are the editor of Al Aminn's monthly authority newsletter. Draft a concise newsletter (600-900 words) with: a 1-2 sentence intro, 3-4 short sections (each with a headline and 2-3 sentences), and a closing CTA. Tone: senior, generous, no hype.",
  "case-study-draft":
    "You are a case study writer. Produce a structured markdown case study with sections: Context, Challenge, Role, Intervention, System Built, Verified Outcome, Confidentiality Status. Be specific and honest — no invented metrics.",
  "partnership-proposal":
    "You are drafting a partnership proposal on behalf of Al Aminn. Produce a markdown document with: Executive Summary, Mutual Value, Proposed Scope, Roles & Responsibilities, Success Metrics, Next Steps. Professional, specific, no jargon.",
  "university-research-brief":
    "You are a research analyst producing a brief on a target university. Output markdown sections: Overview, Strengths, Relevant Programmes, Research Areas, Notable Faculty, Application Notes. Factual, sourced, no fabrication.",
  "operations-audit":
    "You are an operations auditor. Produce a markdown audit summary with: Scope, Methodology, Findings (by area), Risk Rating, Recommendations (prioritized). Honest, specific, actionable.",
  "sales-process-review":
    "You are a sales operations consultant. Produce a markdown review with: Current State, Gaps, Recommended Process, Stage Definitions, Metrics to Track. Practical, no theory.",
  "crm-requirements-draft":
    "You are a CRM architect. Produce a markdown requirements document with: Business Context, User Roles, Core Workflows, Data Model, Integrations, Success Criteria. Specific, buildable.",
  "presentation-outline":
    "You are an executive speechwriter. Produce a presentation outline with: Working Title, Audience, Core Message, Slide-by-Slide Outline (10-15 slides), Talking Points per slide, Suggested Visuals. Tight, narrative-driven.",
  "speaking-notes":
    "You are drafting speaking notes for an executive talk. Output markdown with: Opening Hook, 3-5 Key Talking Points (each with a story/example), Anticipated Questions + Suggested Answers, Closing. Conversational, memorable.",
  "media-response":
    "You are drafting a media response on behalf of Al Aminn. Produce a concise, on-message response (200-400 words) that addresses the question, reinforces key messages, and bridges to positive territory. No speculation.",
  "monthly-authority-report":
    "You are compiling Al Aminn's monthly authority report. Output markdown with: Executive Summary, Key Wins, Content Published, Pipeline Updates, Ecosystem Activity, Risks & Watch Items, Next Month Focus. Specific, no filler.",
  "competitor-research":
    "You are a competitive intelligence analyst. Produce a markdown brief with: Competitor Overview, Positioning, Strengths, Weaknesses, Recent Moves, Implications for Us. Factual, sourced, no invention.",
  "resource-checklist":
    "You are producing a resource checklist for an executive engagement. Output markdown with: a checklist of 10-20 items grouped by category, each with a 1-sentence rationale. Practical, complete.",
  "risk-review":
    "You are a risk analyst. Produce a markdown review with: Risk Register (5-10 risks), each with Likelihood, Impact, Mitigation, Owner. Honest, prioritized.",
  "brand-consistency-audit":
    "You are a brand auditor. Produce a markdown audit with: Brand Touchpoints Reviewed, Consistency Findings (by touchpoint), Recommendations (prioritized). Specific, actionable.",
  // Additional UI workflow aliases (Executive, Higher Study & English Learning)
  "article-draft":
    "You are an SEO content strategist drafting an authoritative markdown article (800-1,200 words) with H2/H3 structure, executive insights, and a clear CTA.",
  "executive-summary":
    "You are a chief of staff writing a crisp 1-page executive summary with Situation, Key Findings, Strategic Options, and Recommended Next Actions.",
  "proposal-draft":
    "You are drafting an executive client/partnership proposal with Executive Summary, Scope, Deliverables, Governance, Timeline, and Next Steps.",
  "seo-brief":
    "You are a technical SEO strategist producing a search brief with Primary/Secondary Keywords, Search Intent, H1/H2 Outline, Internal Link Targets, and Meta Title/Description.",
  "social-post":
    "You are an executive ghostwriter drafting a high-signal LinkedIn post (< 1,200 chars) with a strong opening hook, concrete operational insight, and closing discussion question.",
  "university-research":
    "You are a Higher-Study university research specialist. Produce a structured brief covering University Overview, Global Ranking Context, Target Programmes, Tuition & Funding, Intake Deadlines, and Admission Checklist.",
  "scholarship-guide":
    "You are an international scholarships advisor. Produce a structured scholarship application guide covering Eligibility, Funding Coverage, Required Documents, Selection Criteria, and Timeline.",
  "sop-draft":
    "You are an academic admissions mentor drafting a compelling Statement of Purpose (SOP) structure and tailored narrative draft without fabricating credentials.",
  "supervisor-outreach":
    "You are a doctoral/research admissions advisor drafting a concise, high-response prospective supervisor outreach email referencing alignment, research problem, and CV summary.",
  "visa-checklist":
    "You are a student mobility compliance specialist producing a country-specific student visa documentation and financial readiness checklist (always remind applicant to verify latest embassy rules).",
  "ielts-lesson":
    "You are a senior IELTS curriculum designer creating a structured lesson plan with Band Descriptors, Strategy Breakdown, Worked Examples, Common Pitfalls, and Practice Drills.",
  "practice-questions":
    "You are an English proficiency assessment designer creating original IELTS/TOEFL/PTE practice questions with an Answer Key and Band-level explanations.",
  "speaking-cue-card":
    "You are an IELTS Speaking examiner creating a Part 2 Cue Card, Band 8+ model response skeleton, lexical resource upgrades, and Part 3 follow-up questions.",
  "writing-feedback":
    "You are an IELTS Writing evaluator producing a structured rubric breakdown across Task Achievement, Coherence & Cohesion, Lexical Resource, and Grammatical Range & Accuracy.",
  "vocabulary-pack":
    "You are an academic English lexicographer curating a high-utility Band 8+ collocations and academic vocabulary pack with register notes and example sentences.",
};

const DEFAULT_WORKFLOW_PROMPT =
  "You are an AI assistant supporting Al Aminn's executive platform. Produce a clear, well-structured markdown response to the user's objective. Be specific, honest, and avoid filler. Do not invent facts, metrics, or quotes.";

const MAX_OUTPUT_CHARS = 16_000;

export async function executeAiTaskWithFreeRouter(
  taskId: string,
  options?: {
    preferredProvider?: FreeProviderId | "auto";
    preferredModel?: string;
    tier?: ModelSpeedTier | "auto";
  }
) {
  const task = await db.aiTask.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new Error(`AiTask ${taskId} not found.`);
  }

  await db.aiTask.update({
    where: { id: taskId },
    data: { status: "processing" },
  });

  try {
    const systemPrompt = WORKFLOW_PROMPTS[task.workflow] || DEFAULT_WORKFLOW_PROMPT;
    const userPrompt = `${task.objective}\n\n---\n\nFull brief:\n${task.prompt}`;

    const completion = await runFreeAiRouter({
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      preferredProvider: options?.preferredProvider || "auto",
      preferredModel: options?.preferredModel,
      tier: options?.tier || "flagship",
      maxTokens: 2000,
      bypassCache: true,
    });

    let resultText = completion.content;
    if (resultText.length > MAX_OUTPUT_CHARS) {
      resultText = `${resultText.slice(0, MAX_OUTPUT_CHARS)}\n\n...[output truncated at ${MAX_OUTPUT_CHARS} chars]`;
    }
    const footer = `\n\n---\n_Generated via **${completion.providerName}** (\`${completion.modelUsed}\`) in ${completion.latencyMs}ms_`;
    const nextStatus = task.approvalRequired ? "awaiting-approval" : "delivered";

    const updated = await db.aiTask.update({
      where: { id: taskId },
      data: {
        status: nextStatus,
        result: `${resultText}${footer}`,
        completedAt: new Date(),
      },
    });

    return {
      task: updated,
      providerUsed: completion.providerUsed,
      providerName: completion.providerName,
      modelUsed: completion.modelUsed,
      latencyMs: completion.latencyMs,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const failed = await db.aiTask.update({
      where: { id: taskId },
      data: {
        status: "failed",
        result: `**Execution failed:** ${errMsg}`,
        completedAt: new Date(),
      },
    });
    return {
      task: failed,
      providerUsed: "local-grounded" as const,
      providerName: "Error",
      modelUsed: "none",
      latencyMs: 0,
      error: errMsg,
    };
  }
}

"use client";

/**
 * Research Proposal Builder — public Higher Study tool.
 * -----------------------------------------------------
 * 9-step wizard that captures the standard academic proposal
 * structure: institution/programme, supervisor/title, background,
 * problem/gap, objectives/questions, methodology, data/analysis,
 * ethics/feasibility, timeline/refs. Drafts auto-save to
 * localStorage. A preview assembles the sections into a standard
 * academic-structure layout, then submits to
 * POST /api/v1/higher-study/proposal for AI-assisted drafting.
 *
 * Disclaimer: Human academic review is mandatory before submission.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "alaminn.proposal.v1";
const DISCLAIMER = "Human academic review is mandatory before submission.";

const STEPS = [
  { key: "institution", label: "Institution / programme", hint: "Target university, department, degree (PhD/MPhil/MRes)." },
  { key: "supervisor", label: "Supervisor & title", hint: "Proposed supervisor(s) and a working title." },
  { key: "background", label: "Background", hint: "Field context, prior literature that motivates the work." },
  { key: "problem", label: "Problem / gap", hint: "The specific gap, tension, or unresolved question." },
  { key: "objectives", label: "Objectives / questions", hint: "Aim, 2–4 objectives or research questions." },
  { key: "methodology", label: "Methodology", hint: "Design, methods, theoretical framework, instruments." },
  { key: "data", label: "Data & analysis", hint: "Data sources, sampling, analysis plan, tools." },
  { key: "ethics", label: "Ethics & feasibility", hint: "Ethical considerations, timeline feasibility, risks." },
  { key: "timeline", label: "Timeline & references", hint: "12–36 month timeline and key references (5–10)." },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

type ProposalDraft = Record<StepKey, string>;

const EMPTY_DRAFT: ProposalDraft = {
  institution: "",
  supervisor: "",
  background: "",
  problem: "",
  objectives: "",
  methodology: "",
  data: "",
  ethics: "",
  timeline: "",
};

const SECTION_LABELS: Record<StepKey, string> = {
  institution: "1. Institution & Programme",
  supervisor: "2. Supervisor & Working Title",
  background: "3. Background",
  problem: "4. Problem Statement & Gap",
  objectives: "5. Objectives & Research Questions",
  methodology: "6. Methodology",
  data: "7. Data & Analysis Plan",
  ethics: "8. Ethics & Feasibility",
  timeline: "9. Timeline & References",
};

function loadDraft(): ProposalDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<ProposalDraft>;
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return EMPTY_DRAFT;
  }
}

export default function ProposalBuilderPage() {
  const [draft, setDraft] = useState<ProposalDraft>(EMPTY_DRAFT);
  const [stepIdx, setStepIdx] = useState(0);
  const [submitted, setSubmitted] = useState<{ taskId: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(loadDraft());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      } catch {
        // non-fatal
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [draft]);

  const current = STEPS[stepIdx];
  const isPreview = stepIdx === STEPS.length;

  const update = useCallback(
    (key: StepKey, value: string) => setDraft((d) => ({ ...d, [key]: value })),
    [],
  );

  const next = () => setStepIdx((i) => Math.min(i + 1, STEPS.length));
  const prev = () => setStepIdx((i) => Math.max(i - 1, 0));

  const assembled = useMemo(() => {
    const order: StepKey[] = STEPS.map((s) => s.key) as StepKey[];
    const blocks = order
      .map((k) => {
        const v = draft[k].trim();
        return v ? `${SECTION_LABELS[k]}\n${v}` : null;
      })
      .filter((b): b is string => Boolean(b));
    return blocks.join("\n\n---\n\n");
  }, [draft]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/higher-study/proposal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: assembled }),
      });
      const json = (await res.json()) as { success?: boolean; data?: { taskId?: string }; message?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Submission failed.");
      }
      setSubmitted({ taskId: json.data?.taskId || "queued" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Research Proposal Builder</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Draft your MPhil / MRes / PhD proposal in 9 steps. Drafts auto-save to this browser.
        </p>
      </header>

      <ol className="flex flex-wrap gap-1 mb-6 text-xs">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <button
              onClick={() => setStepIdx(i)}
              className={
                "px-2 py-1 rounded border " +
                (i === stepIdx
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted border-border")
              }
            >
              {i + 1}. {s.label}
            </button>
          </li>
        ))}
        <li>
          <button
            onClick={() => setStepIdx(STEPS.length)}
            className={
              "px-2 py-1 rounded border " +
              (isPreview
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted border-border")
            }
          >
            Preview
          </button>
        </li>
      </ol>

      {submitted ? (
        <div className="border rounded-lg p-6 bg-muted/30">
          <h2 className="text-xl font-semibold mb-2">Proposal submitted</h2>
          <p className="text-sm mb-2">
            Your proposal was queued for AI-assisted drafting. Task ID:{" "}
            <code className="bg-background px-1 rounded">{submitted.taskId}</code>
          </p>
          <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200 dark:border-amber-900 rounded p-3 mt-3">
            {DISCLAIMER}
          </p>
          <button
            onClick={() => setSubmitted(null)}
            className="mt-4 text-sm underline text-muted-foreground"
          >
            Back to editor
          </button>
        </div>
      ) : isPreview ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Preview — standard academic structure</h2>
          <pre className="whitespace-pre-wrap text-sm border rounded-lg p-4 bg-background min-h-48">
            {assembled || "Fill in at least one step to preview the assembled proposal."}
          </pre>
          <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200 dark:border-amber-900 rounded p-3">
            {DISCLAIMER}
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button onClick={prev} className="px-3 py-2 text-sm border rounded">Back</button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !assembled}
              className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit for AI draft"}
            </button>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{current.label}</h2>
            <p className="text-xs text-muted-foreground">{current.hint}</p>
          </div>
          <textarea
            value={draft[current.key]}
            onChange={(e) => update(current.key, e.target.value)}
            rows={8}
            className="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder={`Write about: ${current.hint}`}
          />
          <div className="flex justify-between">
            <button onClick={prev} disabled={stepIdx === 0} className="px-3 py-2 text-sm border rounded disabled:opacity-40">
              Back
            </button>
            <button onClick={next} className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground">
              {stepIdx === STEPS.length - 1 ? "Preview" : "Next"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

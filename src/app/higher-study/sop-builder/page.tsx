"use client";

/**
 * SOP Builder — public Higher Study tool.
 * ---------------------------------------
 * 8-step wizard that captures the building blocks of a Statement of
 * Purpose (academic background, projects/research, work experience,
 * motivation/goals, programme choice, university choice, skills,
 * career goals), auto-saves the draft to localStorage, then shows a
 * preview of the assembled SOP and submits the draft for AI-assisted
 * polish via POST /api/v1/higher-study/sop.
 *
 * IMPORTANT: The AI output is a *draft*. The disclaimer below must be
 * shown on the preview step and after submission. The user is
 * responsible for reviewing, editing and authenticating the final SOP.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "alaminn.sop.v1";
const DISCLAIMER =
  "This is an AI-assisted draft. You must review, edit, and ensure it reflects your authentic voice.";

const STEPS = [
  { key: "academic", label: "Academic background", hint: "Degrees, institutions, GPA, relevant coursework." },
  { key: "projects", label: "Projects / research", hint: "Capstones, papers, theses, hackathoms, fieldwork." },
  { key: "work", label: "Work experience", hint: "Roles, employers, dates, impact, leadership." },
  { key: "motivation", label: "Motivation & goals", hint: "Why this field? What problem do you want to solve?" },
  { key: "programme", label: "Programme choice", hint: "Which degree / specialisation and why it fits." },
  { key: "university", label: "University choice", hint: "Why this institution: faculty, labs, values fit." },
  { key: "skills", label: "Skills", hint: "Technical, analytical, language, leadership skills." },
  { key: "career", label: "Career goals", hint: "Short-term (post-grad) and long-term (5–10 yr)." },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

type SopDraft = Record<StepKey, string>;

const EMPTY_DRAFT: SopDraft = {
  academic: "",
  projects: "",
  work: "",
  motivation: "",
  programme: "",
  university: "",
  skills: "",
  career: "",
};

function loadDraft(): SopDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<SopDraft>;
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return EMPTY_DRAFT;
  }
}

export default function SopBuilderPage() {
  const [draft, setDraft] = useState<SopDraft>(EMPTY_DRAFT);
  const [stepIdx, setStepIdx] = useState(0);
  const [submitted, setSubmitted] = useState<{ taskId: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    setDraft(loadDraft());
  }, []);

  // Auto-save (debounced via a small timer).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      } catch {
        // storage full / unavailable — non-fatal
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

  const assembledSop = useMemo(() => {
    const lines = [
      `Academic Background: ${draft.academic}`,
      `Projects & Research: ${draft.projects}`,
      `Work Experience: ${draft.work}`,
      `Motivation & Goals: ${draft.motivation}`,
      `Programme Choice: ${draft.programme}`,
      `Why This University: ${draft.university}`,
      `Skills: ${draft.skills}`,
      `Career Goals: ${draft.career}`,
    ];
    return lines.filter((l) => l.split(": ")[1]?.trim()).join("\n\n");
  }, [draft]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/higher-study/sop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: assembledSop }),
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
        <h1 className="text-3xl font-bold tracking-tight">SOP Builder</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Build your Statement of Purpose in 8 short steps. Drafts auto-save to this browser.
        </p>
      </header>

      {/* Progress bar */}
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
          <h2 className="text-xl font-semibold mb-2">Draft submitted</h2>
          <p className="text-sm mb-2">
            Your SOP draft was queued for AI-assisted polish. Task ID:{" "}
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
          <h2 className="text-xl font-semibold">Preview</h2>
          <pre className="whitespace-pre-wrap text-sm border rounded-lg p-4 bg-background min-h-48">
            {assembledSop || "Fill in at least one step to see the assembled draft."}
          </pre>
          <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200 dark:border-amber-900 rounded p-3">
            {DISCLAIMER}
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button onClick={prev} className="px-3 py-2 text-sm border rounded">Back</button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !assembledSop}
              className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit for AI polish"}
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

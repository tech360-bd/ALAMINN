"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, Check, Download, FileText, History, Loader2, Lock,
  RefreshCw, Save, Sparkles,
} from "lucide-react";
import { AI_SERVICES, type AIServiceDefinition, type ServiceLanguage } from "@/lib/higher-study/ai-services";
import { cn } from "@/lib/utils";

type DocumentSummary = {
  id: string;
  title: string;
  serviceId: string;
  language: ServiceLanguage;
  revision: number;
  rootId: string;
  preview: string;
  updatedAt: string;
};

type GenerationResult = {
  serviceId: string;
  output: string;
  language: ServiceLanguage;
  provider: string;
  model: string;
  cached: boolean;
  documentId: string | null;
  revision: number;
  saved: boolean;
  privacyNotice: string;
};

const CATEGORY_LABELS: Record<AIServiceDefinition["category"], string> = {
  writing: "Writing",
  research: "Research",
  applications: "Applications",
  academic: "Academic",
};

export function AiServicesClient() {
  const [serviceId, setServiceId] = useState<string>(AI_SERVICES[0].id);
  const [language, setLanguage] = useState<ServiceLanguage>("en");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saveDraft, setSaveDraft] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const service = useMemo(
    () => AI_SERVICES.find((s) => s.id === serviceId) ?? AI_SERVICES[0],
    [serviceId]
  );

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/v1/higher-study/ai-services/documents", {
        credentials: "include",
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: { documents?: DocumentSummary[] } };
        setDocuments(json.data?.documents ?? []);
      }
    } catch {
      // History is optional; generation still works without it.
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/auth/session", { credentials: "include" });
        if (!cancelled && res.ok) {
          setSignedIn(true);
          await loadHistory();
        }
      } catch {
        // Anonymous mode is supported.
      }
    })();
    return () => { cancelled = true; };
  }, [loadHistory]);

  function selectService(id: string) {
    setServiceId(id);
    setValues({});
    setResult(null);
    setError(null);
  }

  async function generate(revisionOf?: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/v1/higher-study/ai-services", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          serviceId: service.id,
          language,
          inputs: values,
          save: signedIn && saveDraft,
          revisionOf,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
        data?: GenerationResult;
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || "Unable to generate a draft.");
      }
      setResult(json.data);
      if (json.data.saved) void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to generate a draft.");
    } finally {
      setBusy(false);
    }
  }

  async function openDocument(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/higher-study/ai-services/documents/${id}`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { output: string; serviceId: string; language: ServiceLanguage; revision: number; documentId?: string };
      };
      if (!res.ok || !json.data) throw new Error("Unable to load this document.");
      const docId = json.data.serviceId;
      if (docId && docId !== serviceId) setServiceId(docId);
      setLanguage(json.data.language);
      setResult({
        serviceId: docId,
        output: json.data.output,
        language: json.data.language,
        provider: "saved draft",
        model: "",
        cached: false,
        documentId: id,
        revision: json.data.revision,
        saved: true,
        privacyNotice: "Private draft — only visible to your account.",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load this document.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument(id: string) {
    try {
      const res = await fetch(`/api/v1/higher-study/ai-services/documents/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setDocuments((current) => current.filter((doc) => doc.id !== id));
        if (result?.documentId === id) setResult(null);
      }
    } catch {
      setError("Unable to delete this document.");
    }
  }

  function downloadDraft() {
    if (!result) return;
    const blob = new Blob([result.output], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${result.serviceId}-draft-${Date.now()}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const categories = Array.from(new Set(AI_SERVICES.map((s) => s.category)));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        <section aria-labelledby="service-picker">
          <h2 id="service-picker" className="mb-3 text-lg font-bold text-ink-900">Choose a service</h2>
          <div className="space-y-4">
            {categories.map((category) => (
              <div key={category}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
                  {CATEGORY_LABELS[category]}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {AI_SERVICES.filter((s) => s.category === category).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectService(item.id)}
                      aria-pressed={item.id === service.id}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        item.id === service.id
                          ? "border-orange-400 bg-orange-50 ring-1 ring-orange-300"
                          : "border-ink-200 bg-white hover:border-orange-300"
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                        {item.id === service.id ? <Check className="h-3.5 w-3.5 text-orange-600" /> : <FileText className="h-3.5 w-3.5 text-ink-400" />}
                        {language === "bn" ? item.titleBn : item.titleEn}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-ink-600">
                        {language === "bn" ? item.descriptionBn : item.descriptionEn}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="service-form" className="rounded-2xl border border-ink-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="service-form" className="text-lg font-bold text-ink-900">
              {language === "bn" ? service.titleBn : service.titleEn}
            </h2>
            <div className="flex rounded-lg border border-ink-200 p-0.5 text-xs" role="group" aria-label="Language">
              {(["en", "bn"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  aria-pressed={language === lang}
                  className={cn(
                    "rounded-md px-3 py-1.5 font-medium",
                    language === lang ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-50"
                  )}
                >
                  {lang === "en" ? "English" : "বাংলা"}
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void generate();
            }}
            className="space-y-4"
          >
            {service.fields.map((f) => {
              const label = language === "bn" ? f.labelBn : f.labelEn;
              const placeholder = language === "bn" ? f.placeholderBn : f.placeholderEn;
              return f.multiline ? (
                <label key={f.name} className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-800">
                    {label} {f.required ? <span className="text-orange-600">*</span> : <span className="text-xs font-normal text-ink-500">(optional)</span>}
                  </span>
                  <textarea
                    value={values[f.name] ?? ""}
                    onChange={(e) => setValues((current) => ({ ...current, [f.name]: e.target.value }))}
                    maxLength={f.maxLength}
                    required={f.required}
                    placeholder={placeholder}
                    rows={4}
                    className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  />
                </label>
              ) : (
                <label key={f.name} className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-800">{label}</span>
                  <input
                    value={values[f.name] ?? ""}
                    onChange={(e) => setValues((current) => ({ ...current, [f.name]: e.target.value }))}
                    maxLength={f.maxLength}
                    required={f.required}
                    placeholder={placeholder}
                    className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  />
                </label>
              );
            })}

            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={signedIn && saveDraft}
                disabled={!signedIn}
                onChange={(e) => setSaveDraft(e.target.checked)}
                className="h-4 w-4 rounded border-ink-300 accent-orange-500"
              />
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              Save privately to my account
              {!signedIn && <span className="text-xs text-ink-500">(sign in to enable)</span>}
            </label>

            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl grad-intelligence px-5 py-2.5 text-sm font-semibold text-white shadow-blue disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate draft
            </button>
          </form>
        </section>

        {result && (
          <section aria-labelledby="draft-output" className="rounded-2xl border border-ink-200 bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 id="draft-output" className="text-lg font-bold text-ink-900">Your draft</h2>
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-600">
                {result.provider}{result.model ? ` · ${result.model}` : ""}
              </span>
              {result.saved && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">Saved · v{result.revision}</span>}
            </div>
            <div className="whitespace-pre-wrap rounded-xl bg-ink-50 p-4 text-sm leading-relaxed text-ink-900">{result.output}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={downloadDraft} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-xs font-medium hover:bg-ink-50">
                <Download className="h-3.5 w-3.5" /> Download .md
              </button>
              {result.documentId && (
                <button
                  type="button"
                  onClick={() => void generate(result.documentId ?? undefined)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-xs font-medium hover:bg-ink-50 disabled:opacity-60"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Generate revision
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-ink-500">{result.privacyNotice}</p>
          </section>
        )}
      </div>

      <aside className="space-y-4" aria-labelledby="history-title">
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <h2 id="history-title" className="flex items-center gap-2 text-sm font-bold text-ink-900">
            <History className="h-4 w-4" /> My drafts
          </h2>
          {!signedIn ? (
            <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-ink-600">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Sign in to keep private drafts and revision history. Anonymous drafts are not stored.
            </p>
          ) : historyLoading ? (
            <p className="mt-2 text-xs text-ink-500">Loading drafts…</p>
          ) : documents.length === 0 ? (
            <p className="mt-2 text-xs text-ink-500">No saved drafts yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {documents.map((doc) => (
                <li key={doc.id} className="rounded-lg border border-ink-200 p-2.5">
                  <button type="button" onClick={() => void openDocument(doc.id)} className="block w-full text-left">
                    <span className="block truncate text-xs font-semibold text-ink-900">{doc.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-ink-500">{doc.preview}</span>
                    <span className="mt-1 block text-[10px] text-ink-400">v{doc.revision} · {new Date(doc.updatedAt).toLocaleDateString()}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteDocument(doc.id)}
                    className="mt-1.5 text-[11px] text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 text-xs leading-relaxed text-ink-700">
          <strong className="font-semibold">Truth-first:</strong> these services draft from your input only. They ask for missing facts, never promise admission or scholarships, and never invent citations or deadlines. Review every draft before submitting.
        </div>
      </aside>
    </div>
  );
}

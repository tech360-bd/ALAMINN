"use client";

/**
 * Visual Email Studio — GrapesJS drag-and-drop editor for email HTML.
 * ---------------------------------------------------------------------
 * Client-only component (GrapesJS requires the DOM; never SSR'd).
 * - Loads the current campaign HTML (from the structured preview) into
 *   the canvas for visual editing.
 * - Basic email-safe blocks: heading, paragraph, CTA button, image,
 *   divider, spacer — no external GrapesJS plugins required.
 * - On save it returns the edited HTML (+ inlined CSS) to the parent,
 *   which stores it as `bodyHtmlOverride` on the campaign — the same
 *   template save/load API (/api/v1/admin/email-builder) as the
 *   structured form.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Save, X } from "lucide-react";

type GrapesEditor = {
  getHtml: () => string;
  getCss: () => string;
  destroy: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
};

type VisualEmailStudioProps = {
  initialHtml: string;
  onSave: (html: string) => void;
  onCancel: () => void;
};

const CONTAINER_STYLE: React.CSSProperties = {
  border: "1px solid #e4e7ec",
  borderRadius: "8px",
  background: "#f9fafb",
};

const BLOCKS = [
  {
    id: "heading",
    label: "Heading",
    content: '<h2 style="color:#101828;margin:0 0 12px">Section heading</h2>',
  },
  {
    id: "paragraph",
    label: "Paragraph",
    content:
      '<p style="font-size:15px;line-height:1.7;color:#344054;margin:0 0 16px">Write your paragraph here. Keep lines short so the email stays readable on mobile.</p>',
  },
  {
    id: "cta",
    label: "CTA Button",
    content:
      '<p style="margin:24px 0"><a href="https://alaminn.info" style="background:#f26113;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Book a consultation</a></p>',
  },
  {
    id: "image",
    label: "Image",
    content:
      '<img src="https://alaminn.info/icon.svg" alt="ALAMINN" style="max-width:100%;border-radius:8px" />',
  },
  {
    id: "divider",
    label: "Divider",
    content: '<hr style="border:0;border-top:1px solid #eee;margin:24px 0" />',
  },
  {
    id: "spacer",
    label: "Spacer",
    content: '<div style="height:24px;line-height:24px">&nbsp;</div>',
  },
];

export default function VisualEmailStudio({ initialHtml, onSave, onCancel }: VisualEmailStudioProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<GrapesEditor | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let editor: GrapesEditor | null = null;

    (async () => {
      try {
        const grapesjs = (await import("grapesjs")).default;
        if (cancelled || !containerRef.current) return;
        const instance = grapesjs.init({
          container: containerRef.current,
          height: "520px",
          width: "auto",
          fromElement: false,
          storageManager: false,
          assetManager: {},
          blockManager: { blocks: BLOCKS.map(({ id, label }) => ({ id, label })) },
        } as never) as unknown as GrapesEditor;

        for (const block of BLOCKS) {
          (instance as unknown as {
            BlockManager: {
              add: (id: string, def: Record<string, unknown>) => void;
            };
          }).BlockManager.add(block.id, { label: block.label, content: block.content });
        }

        // Load the current email HTML onto the canvas.
        const components = (instance as unknown as {
          setComponents: (html: string) => void;
        });
        components.setComponents(initialHtml || "<div></div>");

        editor = instance;
        editorRef.current = instance;
        setReady(true);
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message?.slice(0, 200) ?? "Could not load the visual editor.");
      }
    })();

    return () => {
      cancelled = true;
      try {
        editor?.destroy();
      } catch {
        /* already destroyed */
      }
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = () => {
    const editor = editorRef.current;
    if (!editor) return;
    setSaving(true);
    try {
      const html = editor.getHtml();
      const css = editor.getCss();
      const wrapped =
        css.trim().length > 0
          ? `<!doctype html><html><head><style>${css}</style></head><body>${html}</body></html>`
          : html;
      onSave(wrapped);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Drag blocks from the right panel onto the canvas, then save the design back to the campaign.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={!ready || saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Apply design
          </Button>
        </div>
      </div>
      {loadError ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          The visual editor could not load: {loadError}
        </div>
      ) : (
        <div style={CONTAINER_STYLE}>
          <div ref={containerRef} />
        </div>
      )}
      {!ready && !loadError ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the visual editor…
        </p>
      ) : null}
    </div>
  );
}

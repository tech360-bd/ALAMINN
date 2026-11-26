"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Pencil } from "lucide-react";
import { CrudList, type Column } from "@/components/admin/crud-list";
import { ResourceDialog } from "@/components/admin/resource-dialog";
import { adminFetch } from "@/components/admin/lib";
import { toast } from "sonner";

type CustomField = {
  id: string; entity: string; key: string; label: string; type: string;
  options: string | null; required: boolean; sortOrder: number; status: string;
};

const FIELDS = [
  { name: "label", label: "Label (shown to staff)", type: "text" as const, required: true, placeholder: "Preferred intake" },
  { name: "entity", label: "Applies to", type: "select" as const, options: [
    { value: "contact", label: "Contacts" },
    { value: "inquiry", label: "Inquiries" },
    { value: "opportunity", label: "Opportunities" },
  ] },
  { name: "type", label: "Field type", type: "select" as const, options: [
    { value: "text", label: "Text" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date (YYYY-MM-DD)" },
    { value: "select", label: "Select (one option)" },
    { value: "multiselect", label: "Multi-select" },
    { value: "boolean", label: "Yes/No" },
  ] },
  { name: "options", label: "Options (comma separated, select/multi only)", type: "text" as const, placeholder: "September, January, May" },
  { name: "required", label: "Required", type: "select" as const, options: [
    { value: "false", label: "Optional" },
    { value: "true", label: "Required" },
  ] },
  { name: "sortOrder", label: "Sort order", type: "number" as const },
];

export default function AdminCustomFieldsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function destroy(f: CustomField) {
    if (!confirm(`Archive custom field "${f.label}"? Existing values stay on their records.`)) return;
    try {
      await adminFetch(`/api/v1/admin/custom-fields/${f.id}`, { method: "DELETE" });
      toast.success("Custom field archived.");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Archive failed.");
    }
  }

  const columns: Column<CustomField>[] = [
    { key: "label", label: "Field", render: (f) => (
      <div>
        <div className="font-medium">{f.label}</div>
        <div className="text-xs text-muted-foreground">{f.key}</div>
      </div>
    ) },
    { key: "entity", label: "Entity", render: (f) => <Badge variant="secondary">{f.entity}</Badge> },
    { key: "type", label: "Type", render: (f) => (
      <span className="text-sm">{f.type}{(f.type === "select" || f.type === "multiselect") && f.options ? <span className="text-muted-foreground"> · {f.options}</span> : ""}</span>
    ) },
    { key: "required", label: "Required", render: (f) => (f.required ? "Yes" : "—") },
    { key: "status", label: "Status", render: (f) => (
      <Badge variant={f.status === "active" ? "default" : "secondary"}>{f.status}</Badge>
    ) },
  ];

  return (
    <>
      <CrudList<CustomField>
        key={refreshKey}
        title="Custom Fields"
        subtitle="Staff-defined fields on contacts, inquiries and opportunities. Values are validated by type and stored per record."
        endpoint="/api/v1/admin/custom-fields?includeArchived=true"
        columns={columns}
        onCreate={() => { setEditing(null); setDialogOpen(true); }}
        createLabel="Add Field"
        rowActions={(f) => (
          <div className="flex justify-end gap-1">
            <Button size="icon" variant="ghost" onClick={() => { setEditing(f); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => destroy(f)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        )}
      />
      <ResourceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={() => { setDialogOpen(false); setRefreshKey((k) => k + 1); toast.success(editing ? "Custom field updated." : "Custom field created."); }}
        endpoint={editing ? `/api/v1/admin/custom-fields/${editing.id}` : "/api/v1/admin/custom-fields"}
        title={editing ? "Edit Custom Field" : "Add Custom Field"}
        fields={FIELDS}
        initial={editing ? { ...editing, required: editing.required ? "true" : "false" } : { entity: "contact", type: "text", sortOrder: 0, required: "false" }}
        id={editing?.id}
      />
    </>
  );
}

/**
 * Custom fields — user-defined contact/inquiry/opportunity fields.
 * ------------------------------------------------------------------
 * Definitions live in the `CustomField` table (entity-scoped). Values
 * are stored as a JSON object on the record (`Contact.customFields`),
 * keyed by the normalized field `key`.
 *
 * SECURITY & HONESTY:
 *  - Values are validated strictly against the definition type before
 *    they are persisted; unknown keys are rejected, never silently kept.
 *  - The JSON blob is size-bounded (MAX_CUSTOM_FIELDS bytes) so a
 *    contact row cannot be used as a file dump.
 */

export const CUSTOM_FIELD_ENTITIES = ["contact", "inquiry", "opportunity"] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

export const CUSTOM_FIELD_TYPES = ["text", "number", "date", "select", "multiselect", "boolean"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export interface CustomFieldDef {
  id: string;
  entity: string;
  key: string;
  label: string;
  type: CustomFieldType;
  options?: string | null;
  required: boolean;
  sortOrder: number;
  status: string;
}

export const MAX_CUSTOM_FIELDS_BYTES = 16 * 1024; // 16 KB of JSON per record
export const MAX_CUSTOM_FIELDS_PER_ENTITY = 50;

/** Normalize a human label into a stable machine key (snake_case). */
export function normalizeFieldKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Parse comma-separated option text into clean, deduplicated options. */
export function parseOptions(options: string | null | undefined): string[] {
  if (!options) return [];
  const seen = new Set<string>();
  for (const part of options.split(",")) {
    const v = part.trim();
    if (v) seen.add(v);
  }
  return [...seen];
}

export interface ValidatedFieldDefinition {
  entity: CustomFieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[] | null;
  required: boolean;
  sortOrder: number;
}

/**
 * Validate a definition payload (admin input). Throws Error with a
 * user-presentable message on invalid input — routes convert it to 400.
 */
export function validateFieldDefinition(input: {
  entity?: string;
  label?: string;
  key?: string;
  type?: string;
  options?: string | null;
  required?: boolean;
  sortOrder?: number;
}): ValidatedFieldDefinition {
  const label = (input.label ?? "").trim();
  if (label.length < 2 || label.length > 80) throw new Error("Label must be 2–80 characters.");
  const entity = (input.entity ?? "contact") as CustomFieldEntity;
  if (!CUSTOM_FIELD_ENTITIES.includes(entity)) throw new Error(`Entity must be one of: ${CUSTOM_FIELD_ENTITIES.join(", ")}.`);
  const type = (input.type ?? "text") as CustomFieldType;
  if (!CUSTOM_FIELD_TYPES.includes(type)) throw new Error(`Type must be one of: ${CUSTOM_FIELD_TYPES.join(", ")}.`);
  let key = (input.key ?? "").trim();
  if (!key) key = normalizeFieldKey(label);
  if (!/^[a-z][a-z0-9_]{0,59}$/.test(key)) throw new Error("Key must be snake_case (a–z, 0–9, _), starting with a letter.");
  let options: string[] | null = null;
  if (type === "select" || type === "multiselect") {
    options = parseOptions(input.options);
    if (options.length < 1) throw new Error(`Type "${type}" requires at least one option.`);
    if (options.length > 25) throw new Error("At most 25 options are allowed.");
  }
  const sortOrder = Number.isFinite(input.sortOrder) ? Math.max(0, Math.min(999, Math.trunc(input.sortOrder as number))) : 0;
  return { entity, key, label, type, options, required: !!input.required, sortOrder };
}

/**
 * Validate a single value against a definition.
 * Returns the normalized value (typed), or null when the raw value is
 * an empty string / null / undefined.
 */
export function validateFieldValue(def: Pick<CustomFieldDef, "key" | "type" | "label">, raw: unknown): unknown {
  const present = raw !== null && raw !== undefined && raw !== "";
  if (!present) return null;
  switch (def.type) {
    case "text": {
      if (typeof raw !== "string") throw new Error(`${def.label}: expected text.`);
      const v = raw.trim().slice(0, 2000);
      if (!v) return null;
      return v;
    }
    case "number": {
      const v = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(v)) throw new Error(`${def.label}: expected a number.`);
      return v;
    }
    case "date": {
      const v = String(raw).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new Error(`${def.label}: expected a YYYY-MM-DD date.`);
      return v;
    }
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      const v = String(raw).trim().toLowerCase();
      if (["true", "1", "yes"].includes(v)) return true;
      if (["false", "0", "no"].includes(v)) return false;
      throw new Error(`${def.label}: expected true/false.`);
    }
    case "select": {
      const v = String(raw).trim();
      return v; // allowed options enforced by caller with the full def
    }
    case "multiselect": {
      const arr = Array.isArray(raw) ? raw.map((x) => String(x).trim()) : String(raw).split(",").map((x) => x.trim());
      const clean = arr.filter(Boolean).slice(0, 25);
      if (!clean.length) return null;
      return clean;
    }
    default:
      throw new Error(`${def.label}: unsupported type.`);
  }
}

/** Enforce select/multiselect option membership (needs full def options). */
export function enforceOptionMembership(
  def: Pick<CustomFieldDef, "key" | "type" | "label"> & { options?: string | null },
  value: unknown
): unknown {
  if (value === null || def.type === undefined) return value;
  if (def.type === "select") {
    const allowed = parseOptions(def.options);
    if (allowed.length && !allowed.includes(String(value))) {
      throw new Error(`${def.label}: "${String(value)}" is not one of the allowed options.`);
    }
    return value;
  }
  if (def.type === "multiselect") {
    const allowed = parseOptions(def.options);
    const arr = Array.isArray(value) ? (value as string[]) : [];
    const bad = arr.filter((v) => !allowed.includes(v));
    if (allowed.length && bad.length) {
      throw new Error(`${def.label}: not allowed option value(s): ${bad.join(", ")}.`);
    }
    return arr;
  }
  return value;
}

export interface CustomValuesResult {
  values: Record<string, unknown>;
  dropped: string[];
}

/**
 * Validate a whole custom-values payload against definitions.
 * Unknown keys are DROPPED (never persisted) and reported so callers
 * can surface them; known keys are validated + normalized.
 */
export function validateCustomValues(
  defs: CustomFieldDef[],
  payload: unknown
): CustomValuesResult {
  const source: Record<string, unknown> =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const byKey = new Map(defs.filter((d) => d.status === "active").map((d) => [d.key, d]));
  const values: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, raw] of Object.entries(source)) {
    const def = byKey.get(key);
    if (!def) {
      dropped.push(key);
      continue;
    }
    const validated = enforceOptionMembership(def, validateFieldValue(def, raw));
    if (validated !== null) values[key] = validated;
  }
  const serialized = JSON.stringify(values);
  if (serialized.length > MAX_CUSTOM_FIELDS_BYTES) {
    throw new Error(`Custom field values exceed the ${MAX_CUSTOM_FIELDS_BYTES} byte limit.`);
  }
  return { values, dropped };
}

/** Safe parse of the stored JSON blob (never throws). */
export function readCustomValues(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

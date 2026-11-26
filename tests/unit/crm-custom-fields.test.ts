import { describe, it, expect } from "vitest";
import {
  validateFieldDefinition,
  validateFieldValue,
  enforceOptionMembership,
  validateCustomValues,
  readCustomValues,
  normalizeFieldKey,
} from "@/lib/crm/custom-fields";

describe("custom field definitions", () => {
  it("normalizes labels into snake_case keys", () => {
    expect(normalizeFieldKey("Preferred Study Level!")).toBe("preferred_study_level");
  });

  it("validates a full definition and derives the key from the label", () => {
    const def = validateFieldDefinition({ label: "Preferred intake", type: "select", options: "September, January , September" });
    expect(def.key).toBe("preferred_intake");
    expect(def.options).toEqual(["September", "January"]);
  });

  it("rejects bad entities, types, keys and empty select options", () => {
    expect(() => validateFieldDefinition({ label: "Valid Label", entity: "banana" })).toThrow(/Entity/i);
    expect(() => validateFieldDefinition({ label: "Valid Label", type: "file" })).toThrow(/Type/i);
    expect(() => validateFieldDefinition({ label: "Valid Label", key: "Not-valid" })).toThrow(/Key/i);
    expect(() => validateFieldDefinition({ label: "Valid Label", type: "select", options: " , " })).toThrow(/option/i);
    expect(() => validateFieldDefinition({ label: "X" })).toThrow(/Label/i);
  });
});

describe("custom field values", () => {
  const def = { id: "1", key: "budget", label: "Budget", type: "number" as const, options: null, required: false, sortOrder: 0, status: "active", entity: "contact" };
  const dateDef = { ...def, key: "start_date", label: "Start date", type: "date" as const };
  const boolDef = { ...def, key: "vip", label: "VIP", type: "boolean" as const };
  const multiDef = { ...def, key: "levels", label: "Levels", type: "multiselect" as const, options: "BSc,MSc,PhD" };

  it("validates and normalizes by type", () => {
    expect(validateFieldValue(def, " 5000 ")).toBe(5000);
    expect(validateFieldValue(def, "")).toBeNull();
    expect(() => validateFieldValue(def, "abc")).toThrow(/number/i);
    expect(validateFieldValue(dateDef, "2026-09-01")).toBe("2026-09-01");
    expect(() => validateFieldValue(dateDef, "01-09-2026")).toThrow(/YYYY-MM-DD/i);
    expect(validateFieldValue(boolDef, "yes")).toBe(true);
    expect(validateFieldValue(boolDef, "No" as never)).toBe(false);
    expect(validateFieldValue(multiDef, ["BSc", "PhD"])).toEqual(["BSc", "PhD"]);
  });

  it("enforces select/multiselect option membership", () => {
    expect(() => enforceOptionMembership(multiDef, ["BSc", "MBA"])).toThrow(/not allowed option/i);
    expect(enforceOptionMembership(multiDef, ["BSc"])).toEqual(["BSc"]);
  });

  it("drops unknown keys and validates known keys in a payload", () => {
    const { values, dropped } = validateCustomValues([def, multiDef as never], { budget: "3000", unknown_key: "x", levels: "MSc" });
    expect(values).toEqual({ budget: 3000, levels: ["MSc"] });
    expect(dropped).toEqual(["unknown_key"]);
  });

  it("reads stored JSON safely", () => {
    expect(readCustomValues('{"a":1}')).toEqual({ a: 1 });
    expect(readCustomValues("not json")).toEqual({});
    expect(readCustomValues(null)).toEqual({});
  });
});

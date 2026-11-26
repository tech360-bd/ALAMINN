/**
 * Zod schemas shared by the automation admin routes.
 * (Route files may only export HTTP handlers + route config, so shared
 * schemas live here.)
 */

import { z } from "zod";
import { AUTOMATION_TRIGGERS, AUTOMATION_OPS, AUTOMATION_ACTIONS } from "./engine";

export const ruleSchema = z.object({
  name: z.string().trim().min(2).max(160),
  trigger: z.enum(AUTOMATION_TRIGGERS),
  conditions: z
    .array(
      z.object({
        field: z.string().trim().min(1).max(80),
        op: z.enum(AUTOMATION_OPS),
        value: z.union([z.string().max(300), z.number(), z.boolean(), z.null()]).optional(),
      })
    )
    .max(10)
    .default([]),
  actions: z
    .array(
      z.object({
        type: z.enum(AUTOMATION_ACTIONS),
        params: z.record(z.string(), z.union([z.string().max(300), z.number(), z.boolean(), z.null()])).optional(),
      })
    )
    .min(1)
    .max(10),
  status: z.enum(["draft", "active", "paused"]).default("draft"),
});
export type RuleInput = z.infer<typeof ruleSchema>;

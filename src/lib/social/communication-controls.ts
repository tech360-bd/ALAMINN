/**
 * Human / AI communication control plane.
 *
 * The mode is stored in the existing `Setting` key/value table so no schema
 * migration is required. It is enforced at the final automated-send boundary
 * (`assertAutomationAllowedNow`) and cannot be bypassed by account-level or
 * rule-level automation settings.
 */
import type { PolicyVerdict } from "./policy";

export const COMMUNICATION_MODE_KEY = "communication.mode";
export const SEND_THROUGH_PLATFORM_KEY = "communication.sendThroughPlatform";

export type CommunicationMode =
  | "HUMAN_OPERATOR"
  | "AI_ASSISTED"
  | "AI_AUTONOMOUS"
  | "PAUSED";

export const COMMUNICATION_MODES: readonly CommunicationMode[] = [
  "HUMAN_OPERATOR",
  "AI_ASSISTED",
  "AI_AUTONOMOUS",
  "PAUSED",
];

/**
 * Unknown/corrupt values fail safe to AI_ASSISTED (human approval required).
 * An absent value preserves the pre-existing policy behaviour (AI_AUTONOMOUS
 * constrained by the global engagement switch).
 */
export function parseCommunicationMode(value: string | null | undefined): CommunicationMode {
  if (value === null || value === undefined || value.trim() === "") return "AI_AUTONOMOUS";
  const upper = value.trim().toUpperCase();
  return COMMUNICATION_MODES.find((mode) => mode === upper) ?? "AI_ASSISTED";
}

/**
 * Global verdict that overrides account/rule policy, or `null` when the
 * existing per-account policy evaluator should decide.
 */
export function globalModeVerdict(mode: CommunicationMode): PolicyVerdict | null {
  switch (mode) {
    case "PAUSED":
      return {
        allowAutoSend: false,
        route: "manual",
        reason: "global_communication_paused",
      };
    case "HUMAN_OPERATOR":
      return {
        allowAutoSend: false,
        route: "manual",
        reason: "global_human_operator_mode",
      };
    case "AI_ASSISTED":
      return {
        allowAutoSend: false,
        route: "approval",
        reason: "global_ai_assisted_mode",
      };
    case "AI_AUTONOMOUS":
      return null;
  }
}

/** `sendThroughPlatform=false` means outbound messages stay as internal drafts. */
export function parseSendThroughPlatform(value: string | null | undefined): boolean {
  return value !== "false";
}

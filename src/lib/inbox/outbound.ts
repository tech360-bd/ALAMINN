/**
 * Outbound authorization for the unified inbox.
 *
 * This mirrors the global communication mode at the unified-send boundary. It
 * never grants more permission than the global mode allows; account/channel
 * policy checks remain in the existing social send boundary.
 */
import { type CommunicationMode } from "@/lib/social/communication-controls";

export type OutboundDecision = {
  allowed: boolean;
  route: "send" | "approval" | "manual" | "blocked";
  reason: string;
};

export interface OutboundInput {
  mode: CommunicationMode;
  channel: string;
  allowedChannels: readonly string[];
  external: boolean;
  approvalGiven: boolean;
}

/** Decide whether an automated outbound message may proceed. */
export function authorizeOutbound(input: OutboundInput): OutboundDecision {
  if (input.mode === "PAUSED") {
    return { allowed: false, route: "blocked", reason: "global_communication_paused" };
  }
  if (input.mode === "HUMAN_OPERATOR") {
    return { allowed: false, route: "manual", reason: "global_human_operator_mode" };
  }
  if (!input.external) {
    return { allowed: true, route: "send", reason: "internal_channel" };
  }
  if (!input.allowedChannels.includes(input.channel)) {
    return { allowed: false, route: "blocked", reason: "channel_not_permitted" };
  }
  if (input.mode === "AI_ASSISTED" && !input.approvalGiven) {
    return { allowed: false, route: "approval", reason: "approval_required" };
  }
  return {
    allowed: true,
    route: "send",
    reason: input.mode === "AI_ASSISTED" ? "assisted_approval_recorded" : "autonomous_channel_permitted",
  };
}

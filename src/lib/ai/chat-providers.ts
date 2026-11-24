/** Provider/model selection validation for persisted admin AI chat. */
import { FREE_PROVIDER_MAP, type FreeProviderId } from "./free-providers";

export function resolveChatProvider(value: unknown): FreeProviderId | "auto" {
  if (typeof value !== "string" || !value.trim()) return "auto";
  const trimmed = value.trim();
  if (trimmed === "auto") return "auto";
  return trimmed in FREE_PROVIDER_MAP ? (trimmed as FreeProviderId) : "auto";
}

export function isKnownProvider(value: string): boolean {
  return value === "auto" || value in FREE_PROVIDER_MAP;
}

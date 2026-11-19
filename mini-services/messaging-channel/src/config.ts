/**
 * UMC configuration. Every operational value is environment-driven.
 * No tenant, company, project, domain or brand identity appears here.
 */
import { loadEnvConfig } from '../../../src/lib/load-env';
loadEnvConfig();

export const config = {
  port: Number(process.env.UMC_PORT ?? 3010),
  databaseUrl: process.env.DATABASE_URL,

  // Adapter selection (Phase 1 of the MirrorFly merge plan):
  // defaults are the open-source-first built-ins. Paid third-party adapters
  // (e.g. a licensed MirrorFly connector) may only be activated after the
  // Phase 3 owner-approval gate, by setting these env vars in the deployment.
  messagingProvider: process.env.UMC_MESSAGING_PROVIDER ?? 'builtin-umc',
  moderationProvider: process.env.UMC_MODERATION_PROVIDER ?? 'builtin-wordlist',
  telephonyProvider: process.env.UMC_TELEPHONY_PROVIDER ?? 'none',
  consoleProvider: process.env.UMC_CONSOLE_PROVIDER ?? 'builtin-socket',
  translationProvider: process.env.UMC_TRANSLATION_PROVIDER ?? 'llm',
  // Self-hosted translation endpoint (e.g. LibreTranslate / Ollama-compatible).
  // When set it is used verbatim; no vendor is implied or hard-coded.
  translationEndpoint: process.env.UMC_TRANSLATION_ENDPOINT ?? '',

  // Compliance defaults (tenant settings always override these).
  compliance: {
    proactiveSessionMinutes: 30, // inbound customer activity window that permits agent outbound
    maxAttachmentBytes: 1_500_000, // SQLite-stored attachments; production uses object storage
  },

  ai: {
    model: 'glm-4.5-air',
    maxHistoryMessages: 10,
  },

  schedulerIntervalMs: 5_000,
} as const;

/**
 * UMC configuration. Every operational value is environment-driven.
 * No tenant, company, project, domain or brand identity appears here.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load the project-root .env (mini service runs with its own cwd).
// `import.meta.dir` is a Bun extension; access it through a typed narrowing
// so the file also type-checks under standard TypeScript tooling.
const metaDir = (import.meta as unknown as { dir?: string }).dir ?? process.cwd();
const rootEnv = resolve(metaDir, '../../.env');
if (existsSync(rootEnv)) {
  for (const line of readFileSync(rootEnv, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

export const config = {
  port: 3010,
  databaseUrl: process.env.DATABASE_URL ?? 'file:/home/z/my-project/db/custom.db',

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

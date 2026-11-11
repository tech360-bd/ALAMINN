/**
 * Adapter registry — provider selection is environment-driven (config.ts).
 * Built-in open-source implementations are active by default; vendor adapters
 * may be registered only after the Phase 3 owner-approval gate.
 */
import type {
  AgentConsoleBridge,
  MessagingChannel,
  ModerationService,
  TelephonyTransport,
} from './types';
import { BuiltinMessagingChannel } from './builtin-messaging';
import { WordlistModerationService } from './moderation-basic';
import { SocketAgentConsoleBridge } from './console-socket';
import { NoTelephonyTransport } from './telephony-none';
import { config } from '../config';

export interface AdapterSet {
  messaging: MessagingChannel;
  moderation: ModerationService;
  telephony: TelephonyTransport;
  console: AgentConsoleBridge;
}

export function buildAdapters(): AdapterSet {
  const messaging = new BuiltinMessagingChannel();
  const moderation = new WordlistModerationService();
  const telephony = new NoTelephonyTransport();
  const console = new SocketAgentConsoleBridge();

  const messagingWanted = config.messagingProvider;
  const moderationWanted = config.moderationProvider;
  const consoleWanted = config.consoleProvider;
  const telephonyWanted = config.telephonyProvider;

  // Only built-in providers exist in this deployment. Requesting an unknown
  // provider fails fast at boot instead of silently simulating one.
  if (messagingWanted !== messaging.provider) {
    throw new Error(
      `UMC_MESSAGING_PROVIDER='${messagingWanted}' is not available in this deployment. ` +
        `Built-in provider: '${messaging.provider}'. Third-party connectors require a ` +
        `signed license and Phase 3 owner approval, then register here.`,
    );
  }
  if (moderationWanted !== moderation.provider) {
    throw new Error(`UMC_MODERATION_PROVIDER='${moderationWanted}' is not available. Built-in: '${moderation.provider}'.`);
  }
  if (consoleWanted !== console.provider) {
    throw new Error(`UMC_CONSOLE_PROVIDER='${consoleWanted}' is not available. Built-in: '${console.provider}'.`);
  }
  if (telephonyWanted !== telephony.provider) {
    throw new Error(
      `UMC_TELEPHONY_PROVIDER='${telephonyWanted}' is not configured. No telephony credentials are ` +
        `present in this deployment, so no transport is active — voice stays on the calling-center ` +
        `program side. Configure a real transport with its own credentials to register it here.`,
    );
  }

  return { messaging, moderation, telephony, console };
}

export const adapters = buildAdapters();

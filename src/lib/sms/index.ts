/**
 * SMS module barrel.
 * - sendConsentSms / sendSms: send consent-based SMS via provider failover loop
 * - getSmsRouterTelemetry / clearSmsRouterMetrics: per-provider metrics
 * - resolveAllSmsProviderConfigs / FREE_SMS_PROVIDERS: provider catalog
 */
export {
  sendConsentSms,
  sendSms,
  type SendSmsOptions,
} from "./sender";
export {
  sendSms as sendSmsRouter,
  getSmsRouterTelemetry,
  clearSmsRouterMetrics,
  type SmsSendResult,
} from "./router";
export {
  resolveAllSmsProviderConfigs,
  invalidateSmsSettingsCache,
  maskSmsSecret,
  FREE_SMS_PROVIDERS,
  SMS_PROVIDER_MAP,
  DEFAULT_SMS_FALLBACK_ORDER,
  type SmsProviderId,
  type SmsStatus,
  type SmsProviderSpec,
  type ResolvedSmsProviderConfig,
} from "./providers";

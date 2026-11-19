/**
 * Email module barrel.
 * - sendConsentEmail / sendEmail / sendTransactional: send consent-based email via provider failover loop
 * - getEmailRouterTelemetry / clearEmailRouterMetrics: per-provider metrics
 * - resolveAllEmailProviderConfigs / FREE_EMAIL_PROVIDERS: provider catalog
 */
export {
  sendConsentEmail,
  sendEmail,
  sendTransactional,
  type SendEmailOptions,
} from "./sender";
export {
  sendEmail as sendEmailRouter,
  getEmailRouterTelemetry,
  clearEmailRouterMetrics,
  type EmailSendResult,
} from "./router";
export {
  resolveAllEmailProviderConfigs,
  invalidateEmailSettingsCache,
  maskEmailSecret,
  FREE_EMAIL_PROVIDERS,
  EMAIL_PROVIDER_MAP,
  DEFAULT_EMAIL_FALLBACK_ORDER,
  type EmailProviderId,
  type EmailStatus,
  type EmailProviderSpec,
  type ResolvedEmailProviderConfig,
} from "./providers";

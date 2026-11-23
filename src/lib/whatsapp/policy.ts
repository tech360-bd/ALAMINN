/** WhatsApp Cloud API's free-form customer-service window helper (24 hours after the last inbound message). */
export const WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWhatsappCustomerServiceWindowOpen(lastInboundAt: Date | null | undefined, now = Date.now()): boolean {
  if (!lastInboundAt || Number.isNaN(lastInboundAt.getTime())) return false;
  const age = now - lastInboundAt.getTime();
  return age >= 0 && age < WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS;
}

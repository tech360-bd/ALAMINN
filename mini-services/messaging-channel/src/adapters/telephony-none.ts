/**
 * TelephonyTransport with NO provider configured.
 *
 * The master engineering prompt's FINAL PRINCIPLE is explicit: real calls
 * only, and simulation never counts as success. This deployment has no SIP
 * credentials, so there is NO telephony transport here — not a mocked one.
 * Voice ingress/egress remains on the calling-center program side; the
 * interface above is the only contract this service exposes so a licensed
 * transport can be registered later without touching the messaging core.
 */
import type { DialRequest, DialResult, TelephonyTransport } from './types';

export class NoTelephonyTransport implements TelephonyTransport {
  readonly provider = 'none';

  isConfigured(): boolean {
    return false;
  }

  async dial(_req: DialRequest): Promise<DialResult> {
    throw new Error(
      'No telephony transport is configured in this deployment. ' +
        'Dialling is refused rather than simulated (program red line: simulation never counts as success).',
    );
  }

  async hangup(_callId: string): Promise<void> {
    throw new Error('No telephony transport is configured in this deployment.');
  }
}

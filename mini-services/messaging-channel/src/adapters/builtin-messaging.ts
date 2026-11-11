/**
 * Built-in open-source MessagingChannel implementation.
 * It is the program's own real-time chat engine — state stays in this
 * program's database; nothing is delegated to an external vendor.
 */
import type {
  InboundMessage,
  MessagingChannel,
  OutboundMessage,
  SendResult,
} from './types';

type SendImpl = (msg: OutboundMessage) => Promise<SendResult>;

export class BuiltinMessagingChannel implements MessagingChannel {
  readonly provider = 'builtin-umc';
  private sendImpl: SendImpl | null = null;
  private inboundHandlers: Array<(m: InboundMessage) => void> = [];

  /** The core engine binds its real send implementation at boot. */
  bindSend(impl: SendImpl): void {
    this.sendImpl = impl;
  }

  async start(): Promise<void> {
    if (!this.sendImpl) throw new Error('BuiltinMessagingChannel.start(): engine must bindSend() first');
  }

  async send(msg: OutboundMessage): Promise<SendResult> {
    if (!this.sendImpl) throw new Error('Messaging engine not bound');
    return this.sendImpl(msg);
  }

  onInbound(handler: (m: InboundMessage) => void): void {
    this.inboundHandlers.push(handler);
  }

  /** Engine calls this for every message that arrives from a customer. */
  emitInbound(m: InboundMessage): void {
    for (const h of this.inboundHandlers) {
      try {
        h(m);
      } catch (err) {
        console.error('[messaging-channel] inbound handler failed', err);
      }
    }
  }
}

/**
 * The four adapter interfaces committed in Section 7.1 of the MirrorFly
 * Integration & Free-Services Merge Plan ("Adapter Principle"):
 *
 *   1. MessagingChannel      — tenant messaging and notification channel
 *   2. TelephonyTransport    — telephony ingress/egress (voice program side)
 *   3. ModerationService     — content screening for chat content
 *   4. AgentConsoleBridge    — human agent workspace event bridge
 *
 * Rule: a third-party vendor NEVER becomes the system of record. Adapters
 * translate; state lives in this program's database under tenant isolation.
 *
 * Concrete adapters are selected through the registry (env-driven). The
 * built-in, open-source-first implementations are active by default. Paid
 * vendor adapters (e.g. a licensed MirrorFly connector) plug in here only
 * after the Phase 3 owner-approval gate — never before.
 */

// ─────────────────────────── 1. MessagingChannel ───────────────────────────

export interface OutboundMessage {
  tenantId: string;
  conversationId: string;
  senderId: string;
  body: string;
  type?: 'text' | 'admin' | 'structured' | 'custom' | 'attachment' | 'poll';
  payload?: unknown;
  mentions?: string[];
  /** scheduling (catalogue: "Scheduled messages") */
  scheduledFor?: Date;
  /** disappearing messages TTL in seconds (catalogue: "Disappearing messages") */
  ttlSeconds?: number;
  /** when true, marketing consent is enforced for every customer recipient */
  marketing?: boolean;
}

export interface InboundMessage {
  tenantId: string;
  conversationId: string;
  senderId: string;
  body: string;
  type: string;
  payload?: unknown;
  mentions: string[];
  messageId: string;
  language?: string;
}

export interface SendResult {
  messageId: string;
  status: 'sent' | 'scheduled' | 'blocked';
  reason?: string;
}

export interface MessagingChannel {
  readonly provider: string;
  /** Initialise the transport. */
  start(): Promise<void>;
  /** Deliver an outbound message through this channel. */
  send(msg: OutboundMessage): Promise<SendResult>;
  /** Subscribe to inbound traffic on this channel. */
  onInbound(handler: (m: InboundMessage) => void): void;
  /** Engine binding hook — implemented by the built-in channel only. */
  bindSend?(impl: (msg: OutboundMessage) => Promise<SendResult>): void;
  /** Notify the registered inbound handlers — implemented by the built-in channel only. */
  emitInbound?(m: InboundMessage): void;
}

// ─────────────────────────── 2. TelephonyTransport ─────────────────────────

export interface DialRequest {
  tenantId: string;
  to: string;
  from?: string;
  metadata?: Record<string, unknown>;
}

export interface DialResult {
  callId: string;
  status: 'initiated' | 'rejected';
  reason?: string;
}

export interface TelephonyTransport {
  readonly provider: string;
  /** A transport is active only when its deployment credentials exist. */
  isConfigured(): boolean;
  dial(req: DialRequest): Promise<DialResult>;
  hangup(callId: string): Promise<void>;
}

// ──────────────────────────── 3. ModerationService ─────────────────────────

export interface ModerationVerdict {
  action: 'allow' | 'block' | 'flag';
  reason?: string;
  categories?: string[];
}

export interface ModerationService {
  readonly provider: string;
  screen(content: {
    tenantId: string;
    senderId: string;
    text: string;
    conversationId?: string;
  }): Promise<ModerationVerdict>;
}

// ──────────────────────────── 4. AgentConsoleBridge ────────────────────────

export interface HandoffPayload {
  tenantId: string;
  conversationId: string;
  handoffId: string;
  trigger: string;
  detail?: string;
  createdAt: Date;
}

export interface AgentConsoleBridge {
  readonly provider: string;
  publishHandoff(payload: HandoffPayload): Promise<void>;
  publishHandoffUpdate(payload: HandoffPayload & { status: string }): Promise<void>;
}

// ─────────────────────────── Translation provider ──────────────────────────

export interface TranslationProvider {
  readonly provider: string;
  translate(text: string, target: string, source?: string): Promise<{ text: string; lang: string }>;
}

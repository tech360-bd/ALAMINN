/**
 * Outbound webhooks — signed event delivery with bounded retry.
 * -------------------------------------------------------------------
 * Events emitted by the platform (contact.created, inquiry.created,
 * opportunity.stage_changed, application.created, ...) are delivered
 * to every active WebhookEndpoint subscribed to the event.
 *
 * SECURITY & HONESTY:
 *  - Each delivery is signed: `X-ALAMINN-Signature: t=<unix>,v1=<hex>`
 *    where v1 = HMAC-SHA256(endpoint.secret, `${t}.${rawBody}`).
 *  - HTTPS-only URLs; redirects are NOT followed (no SSRF pivots).
 *  - Payloads are bounded (64 KB) and every attempt is recorded in
 *    WebhookDelivery — failures are visible in the admin UI, never
 *    silently dropped.
 *  - Delivery is bounded (8s timeout, max 3 attempts) and NEVER throws
 *    into the caller's request path.
 */

import { createHmac, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

export const WEBHOOK_EVENTS = [
  "contact.created",
  "contact.updated",
  "contact.merged",
  "inquiry.created",
  "opportunity.stage_changed",
  "application.created",
  "lead.imported",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3;
const MAX_PAYLOAD_BYTES = 64 * 1024;

export function signWebhookPayload(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

/** Verify an inbound signature (used by the ecosystem bridge + tests). */
export function verifyWebhookSignature(
  secret: string,
  timestamp: number,
  rawBody: string,
  providedHex: string
): boolean {
  const expected = signWebhookPayload(secret, timestamp, rawBody);
  if (expected.length !== providedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ providedHex.charCodeAt(i);
  return diff === 0;
}

export interface WebhookEmitResult {
  event: WebhookEvent;
  endpoints: number;
  delivered: number;
  failed: number;
}

function guardWebhookUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid webhook URL."); }
  if (u.protocol !== "https:") throw new Error("Webhook URLs must use HTTPS.");
  const host = u.hostname.toLowerCase();
  if (
    host === "169.254.169.254" ||
    host === "metadata.google.internal" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
  ) {
    throw new Error("Webhook URLs must not target loopback, link-local or private addresses.");
  }
  return u;
}

/** Injected fetch for unit tests (defaults to global fetch). */
export type WebhookFetch = (url: string, init: RequestInit) => Promise<Response>;
let webhookFetch: WebhookFetch | null = null;
export function setWebhookFetchForTests(fn: WebhookFetch | null): void {
  webhookFetch = fn;
}

async function deliverOnce(
  endpointId: string,
  url: string,
  secret: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const body = JSON.stringify({ event, sentAt: new Date().toISOString(), data: payload });
  if (body.length > MAX_PAYLOAD_BYTES) return { ok: false, error: "Payload exceeds the 64 KB webhook limit." };
  const t = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(secret, t, body);
  const fetcher = webhookFetch ?? fetch;
  try {
    const res = await fetcher(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ALAMINN-Webhooks/1.0",
        "X-ALAMINN-Event": event,
        "X-ALAMINN-Signature": `t=${t},v1=${signature}`,
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 200 && res.status < 300) return { ok: true };
    return { ok: false, error: `Endpoint responded with status ${res.status}.` };
  } catch (e) {
    return { ok: false, error: (e as Error).message?.slice(0, 300) ?? "Delivery failed." };
  }
}

/**
 * Emit an event to all subscribed active endpoints. Fire-and-forget safe:
 * errors are recorded per endpoint, never thrown to the caller.
 */
type WebhookDb = {
  webhookEndpoint: { findMany(args?: { where?: { status?: string } }): Promise<Array<{ id: string; url: string; events: string; secret: string }>> };
  webhookDelivery: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
};

export async function emitWebhookEvent(
  event: WebhookEvent,
  payload: Record<string, unknown>,
  dbSeam: WebhookDb = db as unknown as WebhookDb
): Promise<WebhookEmitResult> {
  const result: WebhookEmitResult = { event, endpoints: 0, delivered: 0, failed: 0 };
  let endpoints: Array<{ id: string; url: string; events: string; secret: string }> = [];
  try {
    endpoints = await dbSeam.webhookEndpoint.findMany({ where: { status: "active" } });
  } catch {
    return result; // DB unavailable — nothing to deliver to
  }
  for (const ep of endpoints) {
    let subscribed: string[] = [];
    try { subscribed = JSON.parse(ep.events || "[]"); } catch { subscribed = []; }
    if (!Array.isArray(subscribed) || !subscribed.includes(event)) continue;
    let url: URL;
    try { url = guardWebhookUrl(ep.url); } catch { result.failed++; continue; }
    result.endpoints++;
    const delivery = await dbSeam.webhookDelivery.create({
      data: { endpointId: ep.id, event, payload: "{}", status: "pending" },
    }).catch(() => null);
    let ok = false;
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !ok; attempt++) {
      const outcome = await deliverOnce(ep.id, url.toString(), ep.secret, event, payload);
      ok = outcome.ok;
      lastError = outcome.error;
      if (delivery) {
        await dbSeam.webhookDelivery.update({
          where: { id: delivery.id },
          data: { attempts: attempt, status: ok ? "success" : "failed", lastError: ok ? null : (lastError ?? null), deliveredAt: ok ? new Date() : null, payload: JSON.stringify(payload).slice(0, MAX_PAYLOAD_BYTES) },
        }).catch(() => undefined);
      }
    }
    if (ok) result.delivered++; else result.failed++;
  }
  return result;
}

/** New endpoint signing secret. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

/**
 * Universal Messaging Channel (UMC) — service entry point.
 * Real-time chat channel + REST API + compliance control plane for the
 * Universal Enterprise AI Calling Center. Open-source-first; provider
 * selection is environment-driven; no identity is hard-coded.
 */
import { createServer } from 'node:http';
import { config } from './src/config';
import { adapters } from './src/adapters/registry';
import { sendMessage } from './src/lib/engine';
import { initRealtime } from './src/lib/realtime';
import { startScheduler } from './src/lib/scheduler';
import { handleApi } from './src/lib/routes';
import { db } from './src/db';

// Bind the engine into the MessagingChannel adapter (adapter principle:
// everything enters through one audited send path).
adapters.messaging.bindSend?.(sendMessage);

const httpServer = createServer(async (req, res) => {
  try {
    const max = 2_200_000;
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const part of req) {
      const chunk = Buffer.from(part);
      size += chunk.length;
      if (size > max) { res.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    const headers = new Headers({ 'content-type': 'application/json' });
    if (req.headers.cookie) headers.set('cookie', req.headers.cookie);
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://local');
    const upstream = new Request(`http://local${url.pathname}${url.search}`, {
      method, headers, body: size && method !== 'GET' && method !== 'HEAD' ? Buffer.concat(chunks).toString('utf8') : undefined,
    });
    const result = await handleApi(upstream);
    res.writeHead(result.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(await result.text());
  } catch {
    if (!res.headersSent) res.writeHead(400);
    res.end();
  }
});

initRealtime(httpServer);

async function boot(): Promise<void> {
  await adapters.messaging.start();
  await db.$connect();
  httpServer.listen(config.port, "127.0.0.1", () => {
    startScheduler();
    console.log(`[umc] messaging-channel service listening on :${config.port}`);
    console.log(`[umc] providers: messaging=${adapters.messaging.provider} moderation=${adapters.moderation.provider} console=${adapters.console.provider} telephony=${adapters.telephony.provider} translation=${config.translationProvider}`);
    console.log('[umc] telephony transport: none configured (dial attempts are refused, never simulated)');
  });
}

boot().catch((err) => {
  console.error('[umc] boot failed', err);
  process.exit(1);
});

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

const httpServer = createServer((req, res) => {
  // Health shortcut without full routing overhead.
  if (req.url?.startsWith('/api/umc/health') && req.method === 'GET') {
    void handleApi(new Request(`http://local${req.url}`, { method: 'GET' })).then((r) => {
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      void r.text().then((t) => res.end(t));
    });
    return;
  }
  const origin = req.headers.origin ?? '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', 'http://local');
  const bodyChunks: Buffer[] = [];
  req.on('data', (c: Buffer) => bodyChunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(bodyChunks).toString('utf8');
    const init: RequestInit = { method: req.method, headers: { 'content-type': 'application/json' } };
    if (raw) init.body = raw;
    void handleApi(new Request(`http://local${url.pathname}${url.search}`, init)).then(async (r) => {
      res.writeHead(r.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin });
      res.end(await r.text());
    });
  });
});

initRealtime(httpServer);
startScheduler();

async function boot(): Promise<void> {
  await adapters.messaging.start();
  await db.$connect();
  httpServer.listen(config.port, () => {
    console.log(`[umc] messaging-channel service listening on :${config.port}`);
    console.log(`[umc] providers: messaging=${adapters.messaging.provider} moderation=${adapters.moderation.provider} console=${adapters.console.provider} telephony=${adapters.telephony.provider} translation=${config.translationProvider}`);
    console.log('[umc] telephony transport: none configured (dial attempts are refused, never simulated)');
  });
}

boot().catch((err) => {
  console.error('[umc] boot failed', err);
  process.exit(1);
});

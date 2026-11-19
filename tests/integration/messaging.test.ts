import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { io as connect, type Socket } from 'socket.io-client';
import { signToken, SESSION_COOKIE } from '@/lib/auth/token';
import { staffTokenHash } from '@/lib/auth/staff-token-session';
import { once } from 'node:events';

const folder = mkdtempSync(join(tmpdir(), 'alaminn-messaging-'));
const path = join(folder, 'test.sqlite');
const secret = randomBytes(32).toString('hex');
const server = createServer();
const sockets: Socket[] = [];
let db: typeof import('../../mini-services/messaging-channel/src/db').db;
let handle: typeof import('../../mini-services/messaging-channel/src/lib/routes').handleApi;
let realtime: ReturnType<typeof import('../../mini-services/messaging-channel/src/lib/realtime').initRealtime>;
let origin: string;
const priorDb = process.env.DATABASE_URL;
const priorSecret = process.env.SESSION_SECRET;
const auth = new Map<string, string>();

beforeAll(async () => {
  const file = new DatabaseSync(path);
  const dir = 'prisma/migrations/sqlite';
  for (const item of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    file.exec(readFileSync(join(dir, item.name, 'migration.sql'), 'utf8'));
  }
  file.close();
  process.env.DATABASE_URL = `file:${path}`;
  process.env.SESSION_SECRET = secret;
  ({ db } = await import('../../mini-services/messaging-channel/src/db'));
  ({ handleApi: handle } = await import('../../mini-services/messaging-channel/src/lib/routes'));
  const { initRealtime } = await import('../../mini-services/messaging-channel/src/lib/realtime');
  realtime = initRealtime(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  for (const tenant of ['one', 'two']) await db.tenant.create({ data: { id: tenant, name: tenant, slug: tenant } });
  for (const [id, tenant] of [['alice', 'one'], ['bob', 'one'], ['charlie', 'two']]) {
    await db.staffAccount.create({ data: { id, name: id, email: `${id}@example.invalid`, passwordHash: 'unused', role: 'AGENT' } });
    const token = await signToken({ uid: id, sid: id, role: 'AGENT', exp: Math.floor(Date.now() / 1000) + 60 }, secret);
    await db.staffSession.create({ data: { id, accountId: id, tokenHash: staffTokenHash(token), expiresAt: new Date(Date.now() + 60_000) } });
    auth.set(id, `${SESSION_COOKIE}=${token}`);
    await db.messagingUser.create({ data: { id, tenantId: tenant, displayName: id, externalRef: `staff:${id}`, role: 'agent' } });
  }
  await db.conversation.create({ data: { id: 'private', tenantId: 'one', type: 'group', participants: { create: { userId: 'alice' } } } });
  await db.conversation.create({ data: { id: 'public', tenantId: 'one', type: 'group', visibility: 'public' } });
  await db.message.create({ data: { id: 'message', conversationId: 'private', tenantId: 'one', senderId: 'alice', body: 'isolated', sentAt: new Date() } });
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  if (realtime) await realtime.close();
  await db?.$disconnect();
  if (priorDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = priorDb;
  if (priorSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = priorSecret;
  rmSync(folder, { recursive: true, force: true });
});

function call(pathname: string, user?: string, data?: object) {
  return handle(new Request(`http://internal/api/umc${pathname}`, {
    headers: { cookie: user ? auth.get(user)! : '', 'content-type': 'application/json' },
    method: data ? 'POST' : 'GET', body: data ? JSON.stringify(data) : undefined,
  }));
}
function socket(tenantId: string, user?: string) {
  const s = connect(origin, { path: '/socket.io/umc', transports: ['websocket'], autoConnect: false, reconnection: false, auth: { tenantId }, extraHeaders: { Cookie: user ? auth.get(user)! : '' } });
  sockets.push(s);
  return s;
}

describe('messaging on a migrated SQLite database', () => {
  it('requires a persisted staff session and scopes reads by account and conversation', async () => {
    expect((await call('/health')).status).toBe(401);
    expect((await call('/tenants/one/users', 'charlie')).status).toBe(403);
    expect((await call('/conversations/private/messages', 'bob')).status).toBe(403);
    expect((await call('/conversations/private/messages', 'charlie')).status).toBe(403);
    expect((await call('/tenants', 'alice')).status).toBe(200);
    expect((await (await call('/conversations/private/messages', 'alice')).json()).messages[0].id).toBe('message');
  });

  it('keeps socket rooms scoped and joins only the authenticated member', async () => {
    const denied = socket('one', 'charlie');
    const rejected = once(denied, 'connect_error');
    denied.connect();
    await rejected;
    expect(denied.connected).toBe(false);
    const alice = socket('one', 'alice');
    const bob = socket('one', 'bob');
    const ready = [alice, bob].map((client) => { const event = once(client, 'auth:ok'); client.connect(); return event; });
    await Promise.all(ready);
    expect(realtime.sockets.adapter.rooms.get('conv:private')).toEqual(new Set([alice.id]));
    const joined = await call('/conversations/public/join', 'bob', { userId: 'alice' });
    expect(joined.status).toBe(200);
    expect(realtime.sockets.adapter.rooms.get('conv:public')).toEqual(new Set([bob.id]));
    expect(await db.conversationParticipant.count({ where: { conversationId: 'public', userId: 'bob' } })).toBe(1);
  });
});

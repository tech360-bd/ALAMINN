import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { apiBase as base, requireDisposableApi } from '../fixtures/api-target';

requireDisposableApi();
const smtpPort = Number(process.env.TEST_SMTP_PORT ?? 25253);
const staff = { email: `staff-${randomUUID()}@example.invalid`, name: 'Staff lifecycle fixture', password: `Initial-${randomUUID()}` };
const newPassword = `Replacement-${randomUUID()}`;
const mail: string[] = [];
const server = createServer((socket) => {
  let body: string[] | null = null;
  const lines = createInterface({ input: socket, crlfDelay: Infinity });
  socket.write('220 localhost Integration SMTP\r\n');
  lines.on('line', (line) => {
    if (body) {
      if (line === '.') { mail.push(body.join('\n')); body = null; socket.write('250 queued\r\n'); }
      else body.push(line);
    } else if (/^EHLO /i.test(line)) socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
    else if (/^AUTH PLAIN /i.test(line)) socket.write('235 authenticated\r\n');
    else if (/^(MAIL FROM:|RCPT TO:)/i.test(line)) socket.write('250 OK\r\n');
    else if (/^DATA$/i.test(line)) { body = []; socket.write('354 End with dot\r\n'); }
    else if (/^QUIT$/i.test(line)) socket.end('221 Bye\r\n');
    else socket.write('502 unsupported command\r\n');
  });
});

function req(path: string, body?: object, cookie?: string, timeout = 12_000) {
  return fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', redirect: 'manual',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout) });
}
function session(res: Response) {
  const cookie = res.headers.getSetCookie().find((value) => value.startsWith('alo_session='));
  expect(cookie).toBeTruthy();
  return cookie!.split(';')[0];
}

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(smtpPort, '127.0.0.1', resolve); });
});
afterAll(async () => {
  if (server.listening) await new Promise<void>((resolve) => { server.close(() => resolve()); });
});

describe('staff recovery and authorization', () => {
  it('sends the recovery code only by SMTP and atomically consumes it', async () => {
    const denied = await req('/api/auth/register', { ...staff, role: 'ADMIN' });
    expect(denied.status).toBe(401);
    const adminLogin = await req('/api/auth/login', { email: process.env.STAFF_BOOTSTRAP_EMAIL, password: process.env.STAFF_BOOTSTRAP_PASSWORD });
    expect(adminLogin.status).toBe(200);
    const adminCookie = session(adminLogin);
    expect((await req('/api/auth/register', { ...staff, role: 'EDITOR' }, adminCookie)).status).toBe(201);
    const login = await req('/api/auth/login', staff);
    expect(login.status).toBe(200);
    const previous = session(login);
    expect((await req('/api/uci/admin/queue', undefined, previous)).status).toBe(200);
    expect((await req('/api/staff', undefined, previous)).status).toBe(403);
    expect((await req('/admin/uci', undefined, previous, 35_000)).status).toBe(200);
    expect((await req('/admin/forgot-password', undefined, undefined, 25_000)).status).toBe(200);
    expect((await req('/admin/reset-password', undefined, undefined, 25_000)).status).toBe(200);

    const requested = await req('/api/auth/password-reset', { action: 'request', email: staff.email });
    expect(requested.status).toBe(200);
    expect(await requested.json()).not.toHaveProperty('code');
    const code = mail.find((m) => m.includes(staff.email))?.match(/\b(\d{6})\b/)?.[1];
    expect(code).toBeTruthy();
    const confirm = { action: 'confirm', email: staff.email, code, newPassword };
    const first = await Promise.all([req('/api/auth/password-reset', confirm), req('/api/auth/password-reset', confirm)]);
    expect(first.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await req('/api/auth/password-reset', confirm)).status).toBe(400);
    expect((await req('/api/auth/me', undefined, previous)).status).toBe(401);
    expect((await req('/api/auth/login', staff)).status).toBe(401);
    expect((await req('/api/auth/login', { email: staff.email, password: newPassword })).status).toBe(200);
  }, 100_000);

  it('rejects expired and attempt-exhausted codes without changing the password', async () => {
    const expiryStaff = { ...staff, email: `expiry-${randomUUID()}@example.invalid` };
    const admin = await req('/api/auth/login', { email: process.env.STAFF_BOOTSTRAP_EMAIL, password: process.env.STAFF_BOOTSTRAP_PASSWORD });
    expect(admin.status).toBe(200);
    expect((await req('/api/auth/register', { ...expiryStaff, role: 'EDITOR' }, session(admin))).status).toBe(201);
    const request = { action: 'request', email: expiryStaff.email };
    expect((await req('/api/auth/password-reset', request)).status).toBe(200);
    const code = mail.filter((item) => item.includes(expiryStaff.email)).at(-1)?.match(/\b(\d{6})\b/)?.[1];
    expect(code).toBeTruthy();
    const wrongCode = code === '000000' ? '111111' : '000000';
    const confirm = (input: string) => req('/api/auth/password-reset', { action: 'confirm', email: expiryStaff.email, code: input, newPassword: 'Should-not-be-applied!' });
    for (let i = 0; i < 5; i++) expect((await confirm(wrongCode)).status).toBe(400);
    expect((await confirm(code!)).status).toBe(400);
    const sql = new DatabaseSync(process.env.DATABASE_URL!.slice(5));
    try {
      sql.prepare(`UPDATE PasswordResetCode SET attempts=0, expiresAt=? WHERE accountId=(SELECT id FROM StaffAccount WHERE email=?) AND usedAt IS NULL`).run(new Date(0).toISOString(), expiryStaff.email);
    } finally { sql.close(); }
    expect((await confirm(code!)).status).toBe(400);
    expect((await req('/api/auth/login', { email: expiryStaff.email, password: expiryStaff.password })).status).toBe(200);
  }, 20_000);

  it('carries the staff session through the HTTP and Socket.IO app gateway', async () => {
    const sql = new DatabaseSync(process.env.DATABASE_URL!.slice(5));
    const tenant = `gateway-${randomUUID()}`;
    const actor = `actor-${randomUUID()}`;
    try {
      const staff = sql.prepare(`SELECT id FROM StaffAccount WHERE email=?`).get(process.env.STAFF_BOOTSTRAP_EMAIL!)!;
      sql.prepare(`INSERT INTO Tenant(id, slug, name) VALUES(?,?,?)`).run(tenant, tenant, 'Gateway test tenant');
      sql.prepare(`INSERT INTO MessagingUser(id, tenantId, externalRef, displayName, role) VALUES(?,?,?,?,?)`).run(actor, tenant, `staff:${staff.id}`, 'Gateway test actor', 'admin');
    } finally { sql.close(); }
    const umc = spawn(process.execPath, ['--import', 'tsx', 'mini-services/messaging-channel/index.ts'], {
      env: { ...process.env, NODE_ENV: 'development', NEXT_PUBLIC_SITE_URL: base, UMC_PORT: '3010' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    umc.stdout.on('data', (chunk) => { logs += String(chunk); });
    umc.stderr.on('data', (chunk) => { logs += String(chunk); });
    const client = io(base, { path: '/socket.io/umc', addTrailingSlash: false, transports: ['websocket'], reconnection: false, autoConnect: false, auth: { tenantId: tenant } });
    try {
      const login = await req('/api/auth/login', { email: process.env.STAFF_BOOTSTRAP_EMAIL, password: process.env.STAFF_BOOTSTRAP_PASSWORD });
      const credential = session(login);
      const until = Date.now() + 9_000;
      while (!logs.includes('messaging-channel service listening')) {
        if (umc.exitCode !== null || Date.now() > until) throw new Error(`UMC not listening: ${logs}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect((await req('/api/umc/tenants')).status).toBe(401);
      const tenants = await req('/api/umc/tenants', undefined, credential);
      expect(tenants.status).toBe(200);
      expect((await tenants.json()).tenants).toEqual([expect.objectContaining({ id: tenant })]);
      const users = await req(`/api/umc/tenants/${tenant}/users`, undefined, credential);
      expect((await users.json()).me).toBe(actor);
      client.io.opts.extraHeaders = { Cookie: credential, Origin: new URL(base).origin };
      const authed = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('UMC socket handshake timed out')), 8_000);
        client.once('auth:ok', (data) => { clearTimeout(timer); resolve(data); });
        client.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
      });
      client.connect();
      await expect(authed).resolves.toEqual({ userId: actor, tenantId: tenant });
    } finally {
      client.disconnect();
      if (umc.exitCode === null && umc.pid) { const exited = once(umc, 'exit'); umc.kill('SIGTERM'); await exited; }
    }
  }, 20_000);

  it('rejects changed content and stale review versions', async () => {
    const db = new DatabaseSync(process.env.DATABASE_URL!.slice(5));
    const id = randomUUID();
    db.prepare(`INSERT INTO UciInstitution(id,canonicalName,country,updatedAt) VALUES(?,?,?,CURRENT_TIMESTAMP)`).run(id, id, 'Test');
    db.prepare(`INSERT INTO UciRequirementRecord(id,institutionId,fieldsJson,sourceFile,sheet,rowNumber) VALUES(?,?,?,?,?,?)`).run(id, id, '{"tuition":"original"}', 'test', 'test', 1);
    db.close();
    const login = await req('/api/auth/login', { email: process.env.STAFF_BOOTSTRAP_EMAIL, password: process.env.STAFF_BOOTSTRAP_PASSWORD });
    expect(login.status).toBe(200);
    const cookie = session(login);
    const act = (action: string, expectedVersion: number, fieldPatch?: object) => req('/api/uci/admin/action', { recordId: id, action, expectedVersion, fieldPatch }, cookie);
    expect((await act('VERIFY', 0)).status).toBe(200);
    expect((await act('APPROVE', 1, { tuition: 'unreviewed' })).status).toBe(422);
    const parallel = await Promise.all([act('CORRECT', 1, { tuition: 'revised' }), act('APPROVE', 1)]);
    expect(parallel.map((r) => r.status).sort()).toEqual([200, 409]);
  }, 20_000);
});

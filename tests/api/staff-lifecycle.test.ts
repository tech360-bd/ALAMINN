import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
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

function req(path: string, body?: object, cookie?: string) {
  return fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', redirect: 'manual',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12_000) });
}
function session(res: Response) {
  const cookie = res.headers.getSetCookie().find((value) => value.startsWith('alo_session='));
  expect(cookie).toBeTruthy();
  return cookie!.split(';')[0];
}

beforeAll(async () => {
  if (process.env.RUN_STAFF_LIFECYCLE !== '1' || !/^file:.*\/alaminn-test-[^/]+\/test\.sqlite$/.test(process.env.DATABASE_URL ?? '') ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) {
    throw new Error('Staff lifecycle requires a provisioned local disposable test instance (see tests/README.md).');
  }
  const instance = process.env.ALAMINN_TEST_INSTANCE ?? '';
  const readiness = await fetch(`${base}/api/health/ready`, { headers: { 'x-alaminn-test-instance': instance } });
  if (!readiness.ok || readiness.headers.get('x-alaminn-test-instance') !== 'verified') throw new Error('Unverified test server');
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
    expect((await req('/admin/uci', undefined, previous)).status).toBe(200);
    expect((await req('/admin/forgot-password')).status).toBe(200);
    expect((await req('/admin/reset-password')).status).toBe(200);

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
  }, 30_000);

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

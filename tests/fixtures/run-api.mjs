import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const disk = execFileSync(process.execPath, ['tests/fixtures/init-sqlite.mjs'], { encoding: 'utf8' }).trim();
const secret = () => randomBytes(32).toString('hex');
const env = {
  ...process.env, NODE_ENV: 'development', DATABASE_URL: `file:${disk}`,
  JWT_SECRET: secret(), AUTH_SECRET: secret(), SESSION_SECRET: secret(), CRON_SECRET: secret(),
  ALAMINN_TEST_INSTANCE: secret(), RUN_STAFF_LIFECYCLE: '1', NEXT_TELEMETRY_DISABLED: '1',
  TEST_BASE_URL: 'http://localhost:3000', SECURITY_TEST_BASE: 'http://localhost:3000', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
  STAFF_BOOTSTRAP_EMAIL: 'staff-test@example.invalid', STAFF_BOOTSTRAP_PASSWORD: secret(), STAFF_BOOTSTRAP_NAME: 'Disposable staff administrator',
  ADMIN_BOOTSTRAP_EMAIL: 'ci-admin@alaminn.info', ADMIN_BOOTSTRAP_PASSWORD: secret(),
  SMTP_HOST: '127.0.0.1', SMTP_PORT: '25253', SMTP_USER: 'integration', SMTP_PASS: 'local-fixture-only',
  EMAIL_FROM: 'ci@example.invalid', RESEND_API_KEY: '',
};
const run = (args) => spawn('npm', args, { env, stdio: 'inherit' });
async function checked(args) {
  const [status] = await once(run(args), 'exit');
  if (status !== 0) throw new Error(`npm ${args.join(' ')} failed`);
}
let app;
try {
  await checked(['run', 'db:seed']);
  await checked(['run', 'staff:bootstrap']);
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', '3000', '--hostname', '0.0.0.0'], { env, stdio: 'inherit', detached: true });
  const end = Date.now() + 60_000;
  for (;;) {
    if (app.exitCode !== null || Date.now() > end) throw new Error('Disposable app did not become ready; check that port 3000 is free');
    const response = await fetch(`${env.TEST_BASE_URL}/api/health/ready`, { headers: { 'x-alaminn-test-instance': env.ALAMINN_TEST_INSTANCE }, signal: AbortSignal.timeout(1500) }).catch(() => null);
    if (response?.ok && response.headers.get('x-alaminn-test-instance') === 'verified') break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await checked(['run', 'test:integration']);
  if (process.argv.includes('--security')) await checked(['run', 'security:test']);
} finally {
  if (app && app.exitCode === null && app.pid) {
    const stopped = once(app, 'exit');
    process.kill(-app.pid, 'SIGTERM');
    await stopped;
  }
  await rm(dirname(disk), { recursive: true, force: true });
}

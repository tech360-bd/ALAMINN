import { realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

/** Verify the local marker and the running application's per-run challenge before test requests. */
export async function verifyDisposableTarget(base, env = process.env, request = fetch) {
  const target = new URL(base);
  const instance = env.ALAMINN_TEST_INSTANCE ?? '';
  if (target.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
      target.username || target.password || target.pathname !== '/' || target.search || target.hash ||
      Buffer.byteLength(instance) < 32 || !env.DATABASE_URL?.startsWith('file:/')) {
    throw new Error('Tests require a local disposable application. Run npm run test:disposable.');
  }
  try {
    const file = realpathSync(env.DATABASE_URL.slice(5));
    const directory = dirname(file);
    if (dirname(directory) !== realpathSync(tmpdir()) || !basename(directory).startsWith('alaminn-test-') ||
        basename(file) !== 'test.sqlite' || !statSync(file).isFile() ||
        !statSync(join(directory, '.disposable-alaminn-test')).isFile()) throw new Error();
  } catch {
    throw new Error('Missing disposable SQLite file or marker. Run npm run test:disposable.');
  }
  const response = await request(new URL('/api/health/ready', target), {
    headers: { 'x-alaminn-test-instance': instance }, redirect: 'error', signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!response?.ok || response.headers.get('x-alaminn-test-instance') !== 'verified') {
    throw new Error('Disposable application readiness or instance challenge failed. Run npm run test:disposable.');
  }
}

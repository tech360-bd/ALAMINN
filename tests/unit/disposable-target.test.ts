import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { verifyDisposableTarget } from '../fixtures/disposable-target.mjs';

it('probes only the provisioned local fixture, with timeout and no redirects', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'alaminn-test-'));
  const env = { DATABASE_URL: `file:${join(dir, 'test.sqlite')}`, ALAMINN_TEST_INSTANCE: 't'.repeat(32) };
  const request = vi.fn<typeof fetch>();
  const base = 'http://127.0.0.1:3000';
  try {
    writeFileSync(env.DATABASE_URL.slice(5), 'fake database path fixture');
    await expect(verifyDisposableTarget(base, env, request)).rejects.toThrow('marker');
    expect(request).not.toHaveBeenCalled();
    writeFileSync(join(dir, '.disposable-alaminn-test'), '');
    await expect(verifyDisposableTarget('https://remote.example.invalid', env, request)).rejects.toThrow('local disposable');
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce(new Response('{}'));
    await expect(verifyDisposableTarget(base, env, request)).rejects.toThrow('instance challenge');
    request.mockResolvedValueOnce(new Response('{}', { status: 503, headers: { 'x-alaminn-test-instance': 'verified' } }));
    await expect(verifyDisposableTarget(base, env, request)).rejects.toThrow('readiness');
    request.mockResolvedValueOnce(new Response('{}', { headers: { 'x-alaminn-test-instance': 'verified' } }));
    await expect(verifyDisposableTarget(base, env, request)).resolves.toBeUndefined();
    expect(request).toHaveBeenLastCalledWith(new URL(`${base}/api/health/ready`), expect.objectContaining({
      redirect: 'error', signal: expect.any(AbortSignal), headers: { 'x-alaminn-test-instance': env.ALAMINN_TEST_INSTANCE },
    }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

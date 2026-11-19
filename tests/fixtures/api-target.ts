import { beforeAll } from 'vitest';
import { verifyDisposableTarget } from './disposable-target.mjs';

export const apiBase = (process.env.TEST_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export function requireDisposableApi() {
  beforeAll(() => verifyDisposableTarget(apiBase));
}

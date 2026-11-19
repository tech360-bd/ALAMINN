import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sha = 'a'.repeat(40);
const yaml = readFileSync('.github/workflows/deploy.yml', 'utf8');
const verify = yaml.split('      - name: Verify exact main CI\n')[1].split('      - name: Summary')[0];
const script = verify.split('        run: |\n')[1].replace(/^ {10}/gm, '');
const jobs = [
  'Typecheck · Lint · Test · Security · Build',
  'MariaDB migration and persistence',
  'Container build and runtime readiness',
].map(name => `${name}\tsuccess`).join('\n');
const run = ['412', '2', sha, 'main', 'push', 'completed', 'success'].join('\t');

function guard(overrides: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'alaminn-ci-guard-'));
  const output = join(dir, 'output');
  try {
    writeFileSync(output, '');
    writeFileSync(join(dir, 'gh'), `#!/usr/bin/env bash
case "$*" in
  'api repos/test/repo/commits/aaaaaaa --jq .sha') echo "$FULL_OVERRIDE" ;;
  'api repos/test/repo/compare/'*'...main --jq .status') echo "$RELATION" ;;
  'api --method GET repos/test/repo/actions/workflows/ci.yml/runs -f head_sha='*' -f event=push -f branch=main -F per_page=1 --jq '*) printf '%s\\n' "$RUN_ROW" ;;
  'api --paginate repos/test/repo/actions/runs/412/attempts/2/jobs --jq '*) printf '%s\\n' "$JOB_ROWS" ;;
  *) exit 17 ;;
esac
`, { mode: 0o700 });
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8', timeout: 3000,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, INPUT_COMMIT: sha.slice(0, 7), GH_SHA: sha,
        GITHUB_OUTPUT: output, REPO: 'test/repo', FULL_OVERRIDE: sha, RELATION: 'ahead', RUN_ROW: run, JOB_ROWS: jobs, ...overrides },
    });
    return { code: result.status, output: readFileSync(output, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('deployment exact-revision CI guard (mock GitHub responses)', () => {
  it('emits only the canonical SHA after successful jobs in the selected attempt', () => {
    expect(guard()).toEqual({ code: 0, output: `sha=${sha}\n` });
  });
  it.each([
    { RELATION: 'diverged' },
    { FULL_OVERRIDE: 'b'.repeat(40) },
    { RUN_ROW: '' },
    { RUN_ROW: run.replace(sha, 'b'.repeat(40)) },
    { RUN_ROW: run.replace('\tpush\t', '\tpull_request\t') },
    { RUN_ROW: run.replace('\tcompleted\tsuccess', '\tin_progress\t') },
    { RUN_ROW: run.replace(/success$/, 'cancelled') },
    { JOB_ROWS: jobs.split('\n').slice(0, 2).join('\n') },
    { JOB_ROWS: jobs.replace(/success$/, 'failure') },
  ])('does not publish a SHA for ineligible evidence: %j', overrides => {
    expect(guard(overrides)).toEqual({ code: 1, output: '' });
  });
});

/**
 * Live verification of alaminn.info after PR #106 deploy.
 * Uses real Chromium (Playwright) so Cloudflare bot management sees a
 * genuine browser TLS fingerprint (curl gets challenged with 503).
 * Verifies: homepage, health, all admin routes (existing + new),
 * cron auth (401 without secret), admin intelligence APIs (401 anonymous).
 */
const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");

const BASE = "https://alaminn.info";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const ROUTES = [
  { path: "/", expect: 200, label: "homepage" },
  { path: "/api/health", expect: 200, label: "health" },
  { path: "/admin", expect: [200, 307], label: "admin root" },
  { path: "/admin/higher-study", expect: 200, label: "admin higher-study index (new section link)" },
  { path: "/admin/higher-study/intelligence", expect: 200, label: "NEW admin intelligence dashboard" },
  { path: "/admin/higher-study/monitoring", expect: 200, label: "admin monitoring (existing)" },
  { path: "/admin/higher-study/universities", expect: 200, label: "admin universities" },
  { path: "/admin/higher-study/courses", expect: 200, label: "admin courses" },
  { path: "/admin/automation", expect: 200, label: "admin automation (existing)" },
  { path: "/admin/crm", expect: 200, label: "admin crm (existing)" },
  { path: "/api/cron/university-intelligence", expect: 401, label: "NEW cron endpoint (401 without secret)" },
  { path: "/api/cron/higher-study-monitor", expect: 401, label: "existing cron (401 without secret)" },
  { path: "/api/v1/higher-study/admin/intelligence", expect: 401, label: "NEW admin intelligence API (401 anonymous)" },
  { path: "/api/v1/higher-study/admin/intelligence/sources", expect: 401, label: "NEW sources API (401)" },
  { path: "/api/v1/higher-study/admin/intelligence/evidence", expect: 401, label: "NEW evidence API (401)" },
  { path: "/api/v1/higher-study/admin/intelligence/conflicts", expect: 401, label: "NEW conflicts API (401)" },
  { path: "/api/v1/higher-study/admin/intelligence/duplicates", expect: 401, label: "NEW duplicates API (401)" },
  { path: "/api/v1/higher-study/admin/intelligence/jobs", expect: 401, label: "NEW jobs API (401)" },
  { path: "/api/v1/higher-study/admin/intelligence/tasks", expect: 401, label: "NEW tasks API (401)" },
  { path: "/api/v1/higher-study/admin/intelligence/export", expect: 401, label: "NEW export API (401)" },
];

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  let pass = 0, fail = 0;
  const failures = [];
  for (const r of ROUTES) {
    let status = 0;
    let finalUrl = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await page.goto(BASE + r.path, { waitUntil: "domcontentloaded", timeout: 30000 });
        status = resp ? resp.status() : 0;
        finalUrl = page.url();
        if (status === 503) { await page.waitForTimeout(2500); continue; } // challenge/retry
        break;
      } catch (e) {
        status = -1;
        await page.waitForTimeout(2000);
      }
    }
    const expected = Array.isArray(r.expect) ? r.expect : [r.expect];
    const ok = expected.includes(status);
    if (ok) pass++; else { fail++; failures.push(`${r.path} -> ${status} (expected ${expected.join("|")})`); }
    console.log(`${ok ? "PASS" : "FAIL"} ${status} ${r.path} — ${r.label}${status === 503 ? " (challenge page)" : ""}`);
    if (r.path === "/api/health" && ok) {
      const body = await page.textContent("body").catch(() => "");
      console.log(`      health body: ${String(body).slice(0, 120)}`);
    }
  }
  // Course detail page with an existing slug (verification trail renders when evidence exists)
  const course = await page.goto(`${BASE}/higher-study/course-finder`, { waitUntil: "domcontentloaded", timeout: 30000 }).then(r => r.status()).catch(() => -1);
  console.log(`${course === 200 ? "PASS" : "FAIL"} ${course} /higher-study/course-finder — student directory`);
  course === 200 ? pass++ : (fail++, failures.push("/higher-study/course-finder -> " + course));

  console.log(`\nRESULT: ${pass} PASS / ${fail} FAIL of ${ROUTES.length + 1}`);
  if (failures.length) { console.log("FAILURES:"); failures.forEach(f => console.log("  - " + f)); }
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error("FATAL", e.message); process.exit(2); });

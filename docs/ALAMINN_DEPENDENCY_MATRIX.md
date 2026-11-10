# ALAMINN DEPENDENCY MATRIX — Phase 2

> **Status:** Audit-mode. Versions read from `package.json` / lockfiles / upstream
> manifests via the GitHub API. **No dependency was installed, added, or removed.**
> Vulnerability scanning (`npm audit`, pip-audit, cargo-audit) is **blocked in audit mode**
> and is the first action after approval.
> Prior advisory snapshot (2026-11-02, `docs/AGENTOS_PHASE2_FOUNDATION.md`): 45 full /
> 35 production-affected advisories across Next, Nodemailer, Zod, Prisma, Sharp —
> advisory counts, not proven exploits; not re-verified here.

---

## 1. Existing dependency landscape (preserved)

### 1.1 Runtime (from `package.json`; lock: `package-lock.json` + `bun.lock`)

| Area | Packages (pin as in manifest) | Notes |
|---|---|---|
| Framework | next ^16.1.1, react ^19, react-dom ^19 | Standalone output |
| DB | prisma 6.19.0, @prisma/client 6.19.0, @prisma/adapter-libsql 6.19.0, @libsql/client ^0.18.0 | Dual schema (SQLite/MySQL) |
| UI | 29 × @radix-ui/*, tailwind-merge, class-variance-authority, lucide-react, framer-motion ^12, recharts ^2.15, @tanstack/react-query ^5, @tanstack/react-table ^8, zustand ^5, cmdk, vaul, sonner, embla-carousel | Design system intact |
| Forms/validation | react-hook-form ^7.60, @hookform/resolvers ^5.1, zod ^4 | — |
| Email | nodemailer ^9.0.3, react-email ^6.7, @react-email/components ^1.0.12 | — |
| AI | z-ai-web-dev-sdk ^0.0.18 + in-repo provider clients | Hand-rolled providers |
| Content | @mdxeditor/editor ^3.39, react-markdown ^10, react-syntax-highlighter ^15 | Content Studio base |
| i18n/theme | next-intl ^4.3, next-themes ^0.4 | — |
| Images | sharp ^0.34.3 | Native module |
| Misc | date-fns ^4, uuid ^11, dotenv 16.6.1, react-day-picker, react-resizable-panels, input-otp, @reactuses/core | — |
| Dev | typescript ^5, vitest ^4.1 + coverage, @testing-library/*, jsdom, eslint ^9 + eslint-config-next ^16, tailwindcss ^4 + @tailwindcss/postcss, tsx, bun-types | — |

### 1.2 Lockfile posture

- **Two lockfiles** (`package-lock.json` for prod/Docker/CI `npm ci`; `bun.lock` for
  mini-services/dev). Rule: never regenerate one from the other; each package manager
  owns its lock. CI builds from `package-lock.json`.
- Mini-services carry their own `package.json`/`bun.lock` (e.g. `mini-services/ai-worker`).

### 1.3 Supply-chain observations (static)

- `z-ai-web-dev-sdk` (v0.0.18, small surface) — provider SDK; review at upgrade time.
- Native modules (sharp, libsql) — Alpine/musl build care in Docker (already handled).
- No audit possible in this mode → **do not claim "no vulnerabilities"** anywhere.

---

## 2. External-repo dependency implications (27-repo register)

| Repo (decision) | Would bring | Verdict |
|---|---|---|
| marketingskills (ADAPT) | **Nothing** (markdown content) | Safe, zero deps |
| humanizer (ADAPT) | **Nothing** (markdown content) | Safe |
| diagram-design (ADAPT) | **Nothing** (skill content) | Safe |
| ECC (ADAPT selected) | Nothing (content); watch embedded script steps in skills | Review per skill |
| open-seo (ADAPT patterns) | Its runtime (better-auth, Drizzle, @ai-sdk, Cloudflare pkgs) — **not imported**; only workflow/adapter code adapted into existing zod/Prisma stack | No new deps for Alaminn |
| ai-memory (ADAPT patterns) | Rust server — only if ISOLATE lane chosen (out-of-process) | No in-app deps |
| hyperframes (ADAPT/ISOLATE) | npm `hyperframes` (Apache-2.0), Node ≥22, Chromium/ffmpeg runtime | **Only planned new runtime dep from the register** — install gated on `npm audit` + license check |
| MoneyPrinterTurbo (ISOLATE) | Python 3.11 + moviepy/ffmpeg stack (out-of-process) | pip-audit at service setup |
| RSSHub (ISOLATE) | Node container (out-of-process) | image scan at service setup |
| OpenViking / VoiceStudio / siyuan / llm_wiki / context-mode / PI-Desktop / ruflo / cursor/plugins / public-apis / studytra / others | REFERENCE or REJECT — **no dependency import** | n/a |

---

## 3. Planned additions by phase (all gated)

| Phase | Package / dep | Purpose | License | Gate before install |
|---|---|---|---|---|
| 3 | *(none)* | Skills are content; registries use existing zod/Prisma | — | — |
| 4 | PDF parser (candidate: `pdfjs-dist` or `unpdf`) | PDF ingestion | Apache-2.0/MIT (verify at pin time) | `npm audit`, license check, size budget |
| 4 | DOCX parser (candidate: `mammoth`) | DOCX ingestion | BSD-2-Clause (verify) | same |
| 4 | Embedding client (reuse existing provider clients or `@ai-sdk/*`) | Vector search option | — | Phase 4 vector-engine sign-off first |
| 5 | *(none planned)* — DataForSEO via REST fetch | SEO data | — | outbound allow-list config |
| 6 | *(none planned)* — channel adapters hand-rolled like existing social adapters | Unified inbox | — | — |
| 7 | `hyperframes` (Apache-2.0) | HTML→MP4 rendering | Apache-2.0 (NOTICE required) | `npm audit`, license check, sandbox review |
| 7 | optional TTS/ASR SDK (TBD) | voice-over | TBD | legal + consent review (T11) |
| 8 | *(none)* | — | — | — |

Rule: **every** install is a small, reviewable commit that updates this matrix and runs
`npm audit` first; critical/high advisories block the install.

---

## 4. Dependency security review checklist (per install)

1. npm registry metadata + repository provenance.
2. License in GREEN lane (MIT/Apache/BSD/ISC) — otherwise legal gate.
3. `npm audit` clean of critical/high, or documented exception with reachability analysis.
4. Maintenance signal (recent publish, open-issue ratio).
5. Bundle-size / native-module impact on the standalone build.
6. No postinstall scripts beyond known-safe (Prisma generate pattern).
7. Update this matrix + `ALAMINN_DATABASE_CHANGELOG.md` (if schema-affecting) in the same PR.

## 5. Status report (required fields)

| Field | Value |
|---|---|
| **Completed work** | Existing dependency inventory; external-repo dependency implications; phased install plan with license/audit gates; install checklist. |
| **Pending work** | `npm audit` + advisory re-verification (first post-approval action); Phase 4/7 candidate pinning. |
| **Blockers** | Audit-only mode (no installs, no audit tooling). |
| **Security concerns** | 2026-11-02 advisory snapshot (45/35) is stale-by-design; dual lockfile drift; native modules; future hyperframes Chromium surface. |
| **Files changed** | This document only. |
| **Tests executed** | None. |
| **Test results** | n/a. |
| **Rollback instructions** | Delete/checkout this document; no dependencies changed. |

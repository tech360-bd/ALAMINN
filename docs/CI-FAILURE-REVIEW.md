# CI failure review (2026-11-25)

All five workflow files are tracked in Git. Do not commit `.env.config`, database
files, build output, or other ignored runtime data to repair CI; those exclusions
are intentional. PR #101 is not merged into the base of this branch, so its
changes are not present here and must be reviewed and tested separately.

* Run 45388274879 / CI #251 failed because a MariaDB test expected 109 tables
  after the schema grew to 118 models. PR #100 replaced the hard-coded count
  with one derived from the MySQL Prisma schema. Run 45398216950 on the current
  base subsequently passed all CI jobs. The strict catalog and persistence
  checks remain enabled.
* Supply Chain run 45093901649 failed its production npm audit. The same
  critical-severity gate passed in run 45398216908 on the current base. A
  current audit still reports high-severity Prisma/effect advisories; the gate
  is configured for critical findings and this is not a claim of zero risks.
* Run 45517669181 on unmerged PR #101 failed container readiness, while its
  quality and MariaDB jobs passed. Its migrator output in the provided excerpt
  does not establish the cause of the failure. The full job log could not be
  retrieved in this environment. The container step now collects application
  logs on failure, including early container exits, instead of waiting silently;
  rerun CI on the relevant commit and use those logs to diagnose its runtime.
  This change alone does not establish that PR #101's container is fixed.

The first-party checkout, setup and artifact actions and Gitleaks action have
been updated to Node 24-compatible versions to address the reported runtime
deprecations. GitHub-hosted runners are used by these workflows. Deploy and
release jobs require their configured production environment, secrets and
approval; they were not executed as part of this review.

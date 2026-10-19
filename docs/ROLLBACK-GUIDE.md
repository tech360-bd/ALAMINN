# ROLLBACK GUIDE

Complements `docs/disaster-recovery.md` and `DEPLOYMENT-GUIDE.md`. Written for the versioned-release layout used by the deploy workflow and `deploy/deploy.sh`.

## 1. Release layout (target)

```
/home/<user>/alaminn.info/
├── releases/20260930-0900/   # versioned builds (immutable once verified)
├── releases/20260929-1800/
├── current -> releases/20260930-0900   # symlink switched atomically
└── .env                      # lives OUTSIDE releases (survives rollbacks)
```

## 2. Application rollback (bad release, DB compatible) — ~2 minutes

```bash
cd /home/<user>/alaminn.info
ln -sfn "$PWD/releases/<previous-release>" current
sudo systemctl reload alaminn-info     # or: pm2 reload alaminn-info
curl -sf http://127.0.0.1:3076/api/health | grep '"ok"'   # or the app's actual port
curl -s  http://127.0.0.1:3076/ -o /dev/null -w '%{http_code}\n'   # expect 200
```

The deploy workflow performs this same rollback automatically if its post-deploy health check fails.

## 3. Database rollback (schema was migrated)

1. Stop content writes (maintenance notice).
2. Restore the pre-migration backup: `npm run db:restore` (or `scripts/restore.sh`) after verifying the dump with `scripts/verify-backup.sh`.
3. Point the app at the previous release if the new release expects the new schema.
4. Verify: `npm run db:verify` + `/api/health/deep` (admin tier) + one admin login.

**Rule:** never roll the schema forward again after a restore until the migration that failed has been fixed and re-reviewed.

## 4. Secrets/session note

Rolling back does NOT change `.env` (outside releases). If `AUTH_SECRET` must be rotated (suspected compromise), expect all admin sessions to invalidate — users simply log in again.

## 5. Verification after ANY rollback

- `/api/health` → 200 ok; `/api/health/deep` → no degraded services
- `/` and `/higher-study` → 200 with content
- `/api/v1/admin/dashboard` anonymous → 401
- One authorized admin login + one contact-form submission in a controlled test
- No new errors in the app log (`journalctl -u alaminn-info -n 100` or `pm2 logs`)

## 6. Production-server reality check (2026-09-30 audit)

The live site is verified healthy, but the actual on-server release layout, process manager, and backup schedule could NOT be inspected from this environment (no SSH access). Before relying on §2 verbatim, run `scripts/verify-production.sh` on the server and reconcile the layout with this guide.

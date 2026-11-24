# DB Migration Notes — 2026-11-24

## Finding 7: unique empty-string defaults

### Change
Removed `@default("")` from SQLite schema for:
- `User.email`
- `Contact.email`
- `Inquiry.reference`

MySQL schema already had no empty-string defaults for these fields.

### Safety plan before production migration
1. **Backup** production DB and verify restore.
2. **Scan** for sentinel/invalid rows:
   - `SELECT id, email FROM User WHERE email = '' OR email IS NULL;`
   - `SELECT id, email FROM Contact WHERE email = '' OR email IS NULL;`
   - `SELECT id, reference FROM Inquiry WHERE reference = '' OR reference IS NULL;`
3. **Repair** records with owner-approved data; do not invent identifiers.
4. **Check duplicates** and uniqueness conflicts.
5. **Test migration** on disposable DB copy with same engine/version.
6. **Apply** during maintenance window with rollback/restore ready.
7. **Verify** application create/read paths and audit logs.

### Do not
- Run destructive migration on production without backup and disposable-copy validation.
- Force-push or reset migration history.

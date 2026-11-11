#!/usr/bin/env python3
"""Reset ONLY the staff-auth test fixtures (accounts, sessions, reset codes).
UCI/UMC business data is never touched. Used by tests/run_all.mjs setup.

The database path defaults to THIS repo's db/custom.db (repo-relative, so the
script works from any checkout) and can be overridden with STAFF_DB_PATH.
"""
import os
import sqlite3
from pathlib import Path

DB_PATH = os.environ.get(
    "STAFF_DB_PATH",
    str(Path(__file__).resolve().parent.parent / "db" / "custom.db"),
)

con = sqlite3.connect(DB_PATH)
cur = con.cursor()
for table in ("StaffSession", "PasswordResetCode", "StaffAccount"):
    n = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    cur.execute(f"DELETE FROM {table}")
    print(f"cleared {table}: {n} rows")
con.commit()
con.close()
print(f"auth fixtures reset ({DB_PATH}) — bootstrap test will run from a clean state")

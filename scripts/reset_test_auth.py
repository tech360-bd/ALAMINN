#!/usr/bin/env python3
"""Reset ONLY the staff-auth test fixtures (accounts, sessions, reset codes).
UCI/UMC business data is never touched. Used by tests/run_all.mjs setup."""
import sqlite3

con = sqlite3.connect("/home/z/my-project/db/custom.db")
cur = con.cursor()
for table in ("StaffSession", "PasswordResetCode", "StaffAccount"):
    n = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    cur.execute(f"DELETE FROM {table}")
    print(f"cleared {table}: {n} rows")
con.commit()
con.close()
print("auth fixtures reset — bootstrap test will run from a clean state")

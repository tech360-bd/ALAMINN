#!/usr/bin/env python3
"""Reset ONLY the staff-auth test fixtures (accounts, sessions, reset codes).
UCI/UMC business data is never touched. Used by tests/run_all.mjs setup.

The path must belong to an explicitly marked disposable run directory.
"""
import os
import sqlite3
import tempfile
from pathlib import Path

raw = os.environ.get("STAFF_DB_PATH")
if not raw:
    raise SystemExit("STAFF_DB_PATH must explicitly name a disposable test database")
DB_PATH = Path(raw).resolve(strict=True)
parent = DB_PATH.parent
if (parent.parent != Path(tempfile.gettempdir()).resolve() or
        not parent.name.startswith("alaminn-test-") or
        not (parent / ".disposable-alaminn-test").is_file() or
        DB_PATH.name != "test.sqlite"):
    raise SystemExit("Refusing to reset an unmarked database outside a disposable test-run directory")
if os.environ.get("DATABASE_URL") != f"file:{DB_PATH}":
    raise SystemExit("DATABASE_URL must explicitly match the disposable database")

con = sqlite3.connect(DB_PATH)
cur = con.cursor()
for table in ("StaffSession", "PasswordResetCode", "StaffAccount"):
    n = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    cur.execute(f"DELETE FROM {table}")
    print(f"cleared {table}: {n} rows")
con.commit()
con.close()
print(f"auth fixtures reset ({DB_PATH}) — bootstrap test will run from a clean state")

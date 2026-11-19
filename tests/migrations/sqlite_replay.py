"""Replay historical and additive SQLite SQL, then check invariants on a disposable DB."""
from pathlib import Path
import re
import sqlite3
import tempfile

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((ROOT / 'prisma/migrations/sqlite').glob('*/migration.sql'))
SCHEMA = (ROOT / 'prisma/schema.prisma').read_text()


def migrate(db, paths):
    for path in paths:
        db.executescript(path.read_text())


def check(db):
    expected = set(re.findall(r'^model (\w+) \{', SCHEMA, re.M))
    assert len(expected) >= 109
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations'")}
    assert tables == expected, (expected - tables, tables - expected)
    for model, body in re.findall(r'^model (\w+) \{([\s\S]*?)^\}', SCHEMA, re.M):
        columns = {r[1] for r in db.execute(f'PRAGMA table_info("{model}")')}
        scalar = {r[0] for r in re.findall(r'^\s+(\w+)\s+(String|Int|Float|Boolean|DateTime|Json|BigInt|Bytes|Decimal)\b', body, re.M)}
        assert scalar == columns, (model, scalar - columns, columns - scalar)
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
    for model, required in {'StaffAccount': 'StaffAccount_email_key', 'MessagingUser': 'MessagingUser_tenantId_externalRef_key', 'ConversationParticipant': 'ConversationParticipant_conversationId_userId_key'}.items():
        assert any(r[1] == required and r[2] == 1 for r in db.execute(f'PRAGMA index_list("{model}")')), model
    assert db.execute('PRAGMA integrity_check').fetchone() == ('ok',)


with sqlite3.connect(':memory:') as db:
    db.execute('PRAGMA foreign_keys=ON')
    migrate(db, MIGRATIONS)
    check(db)

with tempfile.TemporaryDirectory(prefix='alaminn-migration-test-') as folder:
    file = Path(folder) / 'upgrade.sqlite'
    cutoff = next(i for i, p in enumerate(MIGRATIONS) if 'uci_staff_messaging' in p.parent.name)
    with sqlite3.connect(file) as db:
        db.execute('PRAGMA foreign_keys=ON')
        migrate(db, MIGRATIONS[:cutoff])
        db.execute('INSERT INTO User (id,email,name,updatedAt) VALUES (?,?,?,CURRENT_TIMESTAMP)', ('upgrade-check', 'upgrade@example.invalid', 'Upgrade check'))
    restored = Path(folder) / 'restored.sqlite'
    with sqlite3.connect(f'file:{file}?mode=ro', uri=True) as before, sqlite3.connect(restored) as copy:
        before.backup(copy)
    with sqlite3.connect(restored) as db:
        db.execute('PRAGMA foreign_keys=ON')
        migrate(db, MIGRATIONS[cutoff:])
        check(db)
        assert db.execute('SELECT email FROM User WHERE id=?', ('upgrade-check',)).fetchone() == ('upgrade@example.invalid',)
print('SQLite fresh and restored-copy upgrade migration checks passed')

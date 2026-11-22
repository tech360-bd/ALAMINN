-- ─────────────────────────────────────────────────────────────────
-- Alaminn.info — MariaDB 10.11 initialisation script
-- Target: Ubuntu 22.04 LTS + Nginx + MariaDB
-- ─────────────────────────────────────────────────────────────────
-- Run as the MariaDB root user (or a user with GRANT privileges):
--
--   sudo mariadb < deploy/mariadb-init.sql
--   (or)  sudo mysql -u root -p < deploy/mariadb-init.sql
--
-- This script is IDEMPOTENT: it uses IF NOT EXISTS so re-running
-- is safe. It creates:
--   • database  : aloeduca_alamin_crm  (utf8mb4 / utf8mb4_unicode_ci)
--   • user      : aloeduca_alamin_crm   (localhost + 127.0.0.1 only)
--   • grants    : ALL on aloeduca_alamin_crm.* (least privilege)
--
-- ─── CHANGE THE PASSWORD BELOW BEFORE RUNNING ───────────────────
-- Must match DB_PASSWORD in .env (production uses the hosting-panel
-- provisioned credentials).
-- ─────────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS `aloeduca_alamin_crm`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Create the application user (localhost-only — the Node/Bun app
-- and MariaDB run on the same host, so no remote access is needed).
CREATE USER IF NOT EXISTS 'aloeduca_alamin_crm'@'127.0.0.1'
  IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD';

CREATE USER IF NOT EXISTS 'aloeduca_alamin_crm'@'localhost'
  IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD';

-- Grant full access to the application database only.
GRANT ALL PRIVILEGES ON `aloeduca_alamin_crm`.*
  TO 'aloeduca_alamin_crm'@'127.0.0.1';

GRANT ALL PRIVILEGES ON `aloeduca_alamin_crm`.*
  TO 'aloeduca_alamin_crm'@'localhost';

-- The app needs to create/drop tables during `prisma db push` and
-- migrations. The ALL privilege above covers this. Do NOT grant
-- GLOBAL privileges (SUPER, FILE, etc.) — least privilege.

FLUSH PRIVILEGES;

-- ─────────────────────────────────────────────────────────────────
-- VERIFY (optional, run after):
--   mariadb -u aloeduca_alamin_crm -p aloeduca_alamin_crm -e "SELECT 1;"
--
-- Then set in /var/www/alaminn-info/.env:
--   DATABASE_URL="mysql://aloeduca_alamin_crm:CHANGE_ME_STRONG_PASSWORD@localhost:3306/aloeduca_alamin_crm"
-- ─────────────────────────────────────────────────────────────────

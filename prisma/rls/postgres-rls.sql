-- ============================================================================
-- Universal Messaging Channel — PostgreSQL Row-Level Security policies
-- (production tenancy model; matches prisma/schema.prisma logically)
--
-- The sandbox deployment runs SQLite, where RLS does not exist; tenancy is
-- enforced there by application-layer scoping (every query carries tenantId).
-- On PostgreSQL this file makes the same isolation ENFORCED BY THE DATABASE:
-- even a buggy query cannot cross tenant boundaries.
--
-- Application connections must run as app_role and set the tenant context:
--   SET app.tenant_id = '<tenant-id>';
-- Prisma: execute `SELECT set_config('app.tenant_id', $tenant, true)` inside
-- each request transaction (e.g. via $extends or an interactive transaction).
-- ============================================================================

-- ─── Roles ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_role') THEN
    CREATE ROLE app_role NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;

-- ─── Tenant context helper ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '');
$$ LANGUAGE sql STABLE;

-- ─── Enable + force RLS on every tenant-scoped table ───────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Tenant','User','Conversation','ConversationParticipant','Message','Receipt',
    'Star','Tag','Consent','SuppressEntry','ModerationWord','Report',
    'AuditEvent','HandoffEvent'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- The Tenant table itself: a session may only see the tenant it is set to.
DROP POLICY IF EXISTS tenant_self ON "Tenant";
CREATE POLICY tenant_self ON "Tenant"
  USING (id = app_tenant_id());

-- Generic tenant_isolation policy for all tables carrying tenant_id.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'User','Conversation','Message','Receipt','Star','Tag','Consent',
    'SuppressEntry','ModerationWord','Report','AuditEvent','HandoffEvent',
    'ConversationParticipant'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (%I.tenant_id = app_tenant_id()) WITH CHECK (%I.tenant_id = app_tenant_id())',
      t, t, t
    );
  END LOOP;
END $$;

-- ConversationParticipant: the PostgreSQL deployment denormalises tenant_id
-- onto this table for RLS (added in the same migration; backfilled from its
-- Conversation). The generic policy above covers it once the column exists.

-- ─── Verification queries (run as app_role after SET app.tenant_id) ────────
-- 1. Cross-tenant select must return zero rows:
--      SET app.tenant_id = 'tenant_A';
--      SELECT count(*) FROM "Message" WHERE tenant_id = 'tenant_B';  -- => 0
-- 2. Insert with a foreign tenant_id must fail the RLS WITH CHECK:
--      INSERT INTO "Message" (tenant_id, ...) VALUES ('tenant_B', ...); -- => ERROR
-- 3. Missing context yields zero rows everywhere (app_tenant_id() IS NULL).

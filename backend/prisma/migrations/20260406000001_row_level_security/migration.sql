-- ============================================================================
-- Row Level Security (RLS) for NEXUS
-- ============================================================================
--
-- DESIGN:
--   The application connects as the `nexus_app` role (limited privileges).
--   Background workers (Bull queue processors, session workers) connect as
--   `nexus_worker` role (bypasses RLS — they operate across users).
--   Prisma migrations and admin scripts connect as the superuser.
--
--   At the start of every API request the application sets:
--     SET LOCAL app.current_user_id = '<userId>';
--   RLS policies then enforce that each user can only see and modify their
--   own rows — even if the application-layer WHERE clause is missing.
--
--   This is a defence-in-depth layer. A bug in a router (e.g., missing
--   `userId` filter) will not leak another user's data because Postgres
--   rejects the read at the storage layer.
--
-- ROLES:
--   nexus_app    — API server connections (RLS enforced)
--   nexus_worker — Background worker connections (RLS bypassed via BYPASSRLS)
--
-- NOTE: Run this migration manually via psql or `prisma migrate deploy`.
--   The app role password should be set via environment variable, not hardcoded.
-- ============================================================================

-- ── 1. Create application roles ───────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_app') THEN
    CREATE ROLE nexus_app NOINHERIT LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_worker') THEN
    -- BYPASSRLS so Bull processors can query across all users
    CREATE ROLE nexus_worker NOINHERIT LOGIN BYPASSRLS;
  END IF;
END
$$;

-- Set passwords from environment at deploy time (placeholder here)
-- ALTER ROLE nexus_app    PASSWORD :'NEXUS_APP_DB_PASSWORD';
-- ALTER ROLE nexus_worker PASSWORD :'NEXUS_WORKER_DB_PASSWORD';

-- ── 2. Grant schema and table access to nexus_app ─────────────────────────────

GRANT USAGE ON SCHEMA public TO nexus_app, nexus_worker;

-- nexus_app can SELECT/INSERT/UPDATE/DELETE on all tables
-- but NOT ALTER or DROP (no DDL rights)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexus_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexus_app;

-- nexus_worker gets same DML access but bypasses RLS via role attribute
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexus_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexus_worker;

-- Future tables created by migrations also get grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexus_app, nexus_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO nexus_app, nexus_worker;

-- ── 3. Enable RLS on all user-scoped tables ───────────────────────────────────
--
-- Tables WITHOUT RLS (system-level, no userId):
--   _prisma_migrations  — migration history, no user data
--
-- Tables WITH RLS (every row belongs to a user):
--   users               — users can only read their own profile
--   refresh_tokens      — user sees only their own tokens
--   whatsapp_sessions   — user sees only their sessions
--   contacts            — user sees only their contacts
--   lists               — user sees only their lists
--   list_contacts       — access via parent list ownership
--   campaigns           — user sees only their campaigns
--   campaign_contacts   — access via parent campaign ownership
--   status_posts        — user sees only their posts
--   status_schedules    — access via parent post ownership

ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists              ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_contacts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_schedules   ENABLE ROW LEVEL SECURITY;

-- FORCE RLS even for table owners (prevents accidental superuser bypass in app code)
ALTER TABLE users              FORCE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens     FORCE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sessions  FORCE ROW LEVEL SECURITY;
ALTER TABLE contacts           FORCE ROW LEVEL SECURITY;
ALTER TABLE lists              FORCE ROW LEVEL SECURITY;
ALTER TABLE list_contacts      FORCE ROW LEVEL SECURITY;
ALTER TABLE campaigns          FORCE ROW LEVEL SECURITY;
ALTER TABLE campaign_contacts  FORCE ROW LEVEL SECURITY;
ALTER TABLE status_posts       FORCE ROW LEVEL SECURITY;
ALTER TABLE status_schedules   FORCE ROW LEVEL SECURITY;

-- ── 4. Helper function: get current user ID from session variable ─────────────
--
-- The application sets `app.current_user_id` via SET LOCAL at the start of
-- each transaction. This function reads it safely (returns NULL if not set,
-- which makes all RLS policies deny access by default).

CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS TEXT
  LANGUAGE sql STABLE
  AS $$
    SELECT NULLIF(current_setting('app.current_user_id', TRUE), '')
  $$;

COMMENT ON FUNCTION current_app_user_id() IS
  'Returns the userId injected by the application layer via SET LOCAL app.current_user_id. '
  'Returns NULL if not set, causing RLS policies to deny access by default.';

-- ── 5. RLS Policies ───────────────────────────────────────────────────────────
--
-- Convention:
--   Policy name: {table}_{operation}_own
--   All policies use USING and WITH CHECK so they apply to both reads and writes.
--   SELECT policies use USING only.
--   INSERT/UPDATE/DELETE use WITH CHECK or USING as appropriate.
--
-- We create separate policies per command type for clarity and auditability.

-- ── users ─────────────────────────────────────────────────────────────────────
-- A user can only read and update their own row. No user can INSERT via the
-- app role (registration goes through auth.service.ts which uses the worker role
-- or a privileged context for the initial creation).

DROP POLICY IF EXISTS users_select_own  ON users;
DROP POLICY IF EXISTS users_update_own  ON users;
DROP POLICY IF EXISTS users_delete_own  ON users;

CREATE POLICY users_select_own ON users
  FOR SELECT TO nexus_app
  USING (id = current_app_user_id());

CREATE POLICY users_update_own ON users
  FOR UPDATE TO nexus_app
  USING (id = current_app_user_id())
  WITH CHECK (id = current_app_user_id());

CREATE POLICY users_delete_own ON users
  FOR DELETE TO nexus_app
  USING (id = current_app_user_id());

-- ── refresh_tokens ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS refresh_tokens_select_own ON refresh_tokens;
DROP POLICY IF EXISTS refresh_tokens_insert_own ON refresh_tokens;
DROP POLICY IF EXISTS refresh_tokens_delete_own ON refresh_tokens;

CREATE POLICY refresh_tokens_select_own ON refresh_tokens
  FOR SELECT TO nexus_app
  USING (user_id = current_app_user_id());

CREATE POLICY refresh_tokens_insert_own ON refresh_tokens
  FOR INSERT TO nexus_app
  WITH CHECK (user_id = current_app_user_id());

CREATE POLICY refresh_tokens_delete_own ON refresh_tokens
  FOR DELETE TO nexus_app
  USING (user_id = current_app_user_id());

-- ── whatsapp_sessions ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS whatsapp_sessions_all_own ON whatsapp_sessions;

CREATE POLICY whatsapp_sessions_all_own ON whatsapp_sessions
  FOR ALL TO nexus_app
  USING      (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

-- ── contacts ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS contacts_all_own ON contacts;

CREATE POLICY contacts_all_own ON contacts
  FOR ALL TO nexus_app
  USING      (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

-- ── lists ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS lists_all_own ON lists;

CREATE POLICY lists_all_own ON lists
  FOR ALL TO nexus_app
  USING      (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

-- ── list_contacts ─────────────────────────────────────────────────────────────
-- Access via parent list ownership — user can touch list_contacts rows
-- where the associated list belongs to them.

DROP POLICY IF EXISTS list_contacts_all_own ON list_contacts;

CREATE POLICY list_contacts_all_own ON list_contacts
  FOR ALL TO nexus_app
  USING (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_contacts.list_id
        AND lists.user_id = current_app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_contacts.list_id
        AND lists.user_id = current_app_user_id()
    )
  );

-- ── campaigns ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS campaigns_all_own ON campaigns;

CREATE POLICY campaigns_all_own ON campaigns
  FOR ALL TO nexus_app
  USING      (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

-- ── campaign_contacts ────────────────────────────────────────────────────────
-- Access via parent campaign ownership.

DROP POLICY IF EXISTS campaign_contacts_all_own ON campaign_contacts;

CREATE POLICY campaign_contacts_all_own ON campaign_contacts
  FOR ALL TO nexus_app
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_contacts.campaign_id
        AND campaigns.user_id = current_app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_contacts.campaign_id
        AND campaigns.user_id = current_app_user_id()
    )
  );

-- ── status_posts ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS status_posts_all_own ON status_posts;

CREATE POLICY status_posts_all_own ON status_posts
  FOR ALL TO nexus_app
  USING      (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

-- ── status_schedules ─────────────────────────────────────────────────────────
-- Access via parent post ownership.

DROP POLICY IF EXISTS status_schedules_all_own ON status_schedules;

CREATE POLICY status_schedules_all_own ON status_schedules
  FOR ALL TO nexus_app
  USING (
    EXISTS (
      SELECT 1 FROM status_posts
      WHERE status_posts.id = status_schedules.post_id
        AND status_posts.user_id = current_app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM status_posts
      WHERE status_posts.id = status_schedules.post_id
        AND status_posts.user_id = current_app_user_id()
    )
  );

-- ── 6. Audit log table ────────────────────────────────────────────────────────
--
-- Immutable append-only log of data mutations. The nexus_app role can INSERT
-- but never UPDATE or DELETE (no policy granted for those operations).
-- This table is NOT user-scoped — it records all users' actions for admin review.

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     TEXT,                           -- NULL for system/background actions
  table_name  TEXT         NOT NULL,
  operation   TEXT         NOT NULL,          -- INSERT | UPDATE | DELETE
  row_id      TEXT,                           -- PK of affected row
  old_data    JSONB,                          -- previous values (UPDATE/DELETE)
  new_data    JSONB,                          -- new values (INSERT/UPDATE)
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for querying by user or table
CREATE INDEX IF NOT EXISTS audit_log_user_id    ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS audit_log_table_name ON audit_log (table_name, operation);
CREATE INDEX IF NOT EXISTS audit_log_created_at ON audit_log (created_at DESC);

-- nexus_app can only INSERT into audit_log (immutable from app perspective)
GRANT INSERT ON audit_log TO nexus_app;
GRANT SELECT ON audit_log TO nexus_worker;  -- workers/admin can read
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO nexus_app;

-- RLS on audit_log: nexus_app can insert freely (no user filter on INSERT)
-- but cannot read or delete (admin/worker only)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_insert ON audit_log;
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT TO nexus_app
  WITH CHECK (TRUE);  -- allow all inserts from app role

-- ── 7. Audit trigger function ────────────────────────────────────────────────
--
-- Automatically records mutations on key tables into audit_log.
-- Runs AFTER each INSERT/UPDATE/DELETE so it captures final state.

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit_log (user_id, table_name, operation, row_id, old_data, new_data)
  VALUES (
    current_app_user_id(),
    TG_TABLE_NAME,
    TG_OP,
    CASE
      WHEN TG_OP = 'DELETE' THEN OLD.id::TEXT
      ELSE NEW.id::TEXT
    END,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN NULL;  -- AFTER trigger, return value ignored
END;
$$;

-- Attach audit trigger to sensitive tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'whatsapp_sessions', 'campaigns', 'campaign_contacts',
    'status_posts', 'status_schedules', 'refresh_tokens'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS audit_%I ON %I;
       CREATE TRIGGER audit_%I
         AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();',
      t, t, t, t
    );
  END LOOP;
END;
$$;

-- ── 8. Verify setup (informational — shows policy count) ─────────────────────

DO $$
DECLARE
  policy_count INT;
BEGIN
  SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE schemaname = 'public';
  RAISE NOTICE 'RLS setup complete. Active policies: %', policy_count;
END;
$$;

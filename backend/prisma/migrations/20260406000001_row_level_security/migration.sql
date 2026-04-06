-- ============================================================================
-- Row Level Security (RLS) for NEXUS
-- ============================================================================

-- ── 1. Create application roles ───────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_app') THEN
    CREATE ROLE nexus_app NOINHERIT LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_worker') THEN
    CREATE ROLE nexus_worker NOINHERIT LOGIN BYPASSRLS;
  END IF;
END
$$;

-- ── 2. Grant schema and table access ─────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO nexus_app, nexus_worker;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexus_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexus_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexus_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexus_worker;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexus_app, nexus_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO nexus_app, nexus_worker;

-- ── 3. Enable RLS on all user-scoped tables ───────────────────────────────────

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

-- ── 4. Helper function ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS TEXT
  LANGUAGE sql STABLE
  AS $$
    SELECT NULLIF(current_setting('app.current_user_id', TRUE), '')
  $$;

-- ── 5. RLS Policies ───────────────────────────────────────────────────────────
-- NOTE: Prisma uses camelCase column names (userId, listId, etc.)

-- ── users ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_update_own ON users;
DROP POLICY IF EXISTS users_delete_own ON users;

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
  USING ("userId" = current_app_user_id());

CREATE POLICY refresh_tokens_insert_own ON refresh_tokens
  FOR INSERT TO nexus_app
  WITH CHECK ("userId" = current_app_user_id());

CREATE POLICY refresh_tokens_delete_own ON refresh_tokens
  FOR DELETE TO nexus_app
  USING ("userId" = current_app_user_id());

-- ── whatsapp_sessions ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS whatsapp_sessions_all_own ON whatsapp_sessions;

CREATE POLICY whatsapp_sessions_all_own ON whatsapp_sessions
  FOR ALL TO nexus_app
  USING      ("userId" = current_app_user_id())
  WITH CHECK ("userId" = current_app_user_id());

-- ── contacts ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS contacts_all_own ON contacts;

CREATE POLICY contacts_all_own ON contacts
  FOR ALL TO nexus_app
  USING      ("userId" = current_app_user_id())
  WITH CHECK ("userId" = current_app_user_id());

-- ── lists ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS lists_all_own ON lists;

CREATE POLICY lists_all_own ON lists
  FOR ALL TO nexus_app
  USING      ("userId" = current_app_user_id())
  WITH CHECK ("userId" = current_app_user_id());

-- ── list_contacts ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS list_contacts_all_own ON list_contacts;

CREATE POLICY list_contacts_all_own ON list_contacts
  FOR ALL TO nexus_app
  USING (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_contacts."listId"
        AND lists."userId" = current_app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_contacts."listId"
        AND lists."userId" = current_app_user_id()
    )
  );

-- ── campaigns ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS campaigns_all_own ON campaigns;

CREATE POLICY campaigns_all_own ON campaigns
  FOR ALL TO nexus_app
  USING      ("userId" = current_app_user_id())
  WITH CHECK ("userId" = current_app_user_id());

-- ── campaign_contacts ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS campaign_contacts_all_own ON campaign_contacts;

CREATE POLICY campaign_contacts_all_own ON campaign_contacts
  FOR ALL TO nexus_app
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_contacts."campaignId"
        AND campaigns."userId" = current_app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_contacts."campaignId"
        AND campaigns."userId" = current_app_user_id()
    )
  );

-- ── status_posts ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS status_posts_all_own ON status_posts;

CREATE POLICY status_posts_all_own ON status_posts
  FOR ALL TO nexus_app
  USING      ("userId" = current_app_user_id())
  WITH CHECK ("userId" = current_app_user_id());

-- ── status_schedules ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS status_schedules_all_own ON status_schedules;

CREATE POLICY status_schedules_all_own ON status_schedules
  FOR ALL TO nexus_app
  USING (
    EXISTS (
      SELECT 1 FROM status_posts
      WHERE status_posts.id = status_schedules."postId"
        AND status_posts."userId" = current_app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM status_posts
      WHERE status_posts.id = status_schedules."postId"
        AND status_posts."userId" = current_app_user_id()
    )
  );

-- ── 6. Audit log table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     TEXT,
  table_name  TEXT         NOT NULL,
  operation   TEXT         NOT NULL,
  row_id      TEXT,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_user_id    ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS audit_log_table_name ON audit_log (table_name, operation);
CREATE INDEX IF NOT EXISTS audit_log_created_at ON audit_log (created_at DESC);

GRANT INSERT ON audit_log TO nexus_app;
GRANT SELECT ON audit_log TO nexus_worker;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO nexus_app;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_insert ON audit_log;
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT TO nexus_app
  WITH CHECK (TRUE);

-- ── 7. Audit trigger ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit_log (user_id, table_name, operation, row_id, old_data, new_data)
  VALUES (
    current_app_user_id(),
    TG_TABLE_NAME,
    TG_OP,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id::TEXT ELSE NEW.id::TEXT END,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN NULL;
END;
$$;

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

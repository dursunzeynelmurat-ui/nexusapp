-- Add media_files table with RLS
CREATE TABLE IF NOT EXISTS media_files (
  id         TEXT         PRIMARY KEY,
  user_id    TEXT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT         NOT NULL UNIQUE,
  url        TEXT         NOT NULL,
  mime_type  TEXT         NOT NULL,
  size       INTEGER      NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS media_files_user_id ON media_files (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON media_files TO nexus_app, nexus_worker;

ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_files FORCE ROW LEVEL SECURITY;

CREATE POLICY media_files_all_own ON media_files
  FOR ALL TO nexus_app
  USING      (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

-- Audit trigger
DROP TRIGGER IF EXISTS audit_media_files ON media_files;
CREATE TRIGGER audit_media_files
  AFTER INSERT OR UPDATE OR DELETE ON media_files
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

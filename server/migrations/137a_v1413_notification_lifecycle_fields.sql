-- 137_v1413_notification_lifecycle_fields.sql
-- v1.4.13: Notification lifecycle, touchpoint, scope, dedupe hardening

BEGIN;

-- ============================================================
-- New fields
-- ============================================================
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS touchpoint_type TEXT NOT NULL DEFAULT 'persistent',
  ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS target_route TEXT,
  ADD COLUMN IF NOT EXISTS target_label TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ============================================================
-- Backfill
-- ============================================================
UPDATE notifications SET lifecycle_status = 'active' WHERE lifecycle_status IS NULL;
UPDATE notifications SET touchpoint_type = 'persistent' WHERE touchpoint_type IS NULL;
UPDATE notifications SET scope_type = 'project' WHERE scope_type IS NULL;

-- Auto-backfill company_id from project_id
UPDATE notifications n SET company_id = p.company_id
FROM projects p
WHERE n.project_id = p.id AND n.company_id IS NULL AND n.project_id IS NOT NULL;

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_notifications_project_lifecycle
  ON notifications(project_id, lifecycle_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_company_scope_lifecycle
  ON notifications(company_id, scope_type, lifecycle_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_project_type_lifecycle
  ON notifications(project_id, notification_type, lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_notifications_source_identity
  ON notifications(project_id, source_entity_type, source_entity_id, type);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_active_project_dedupe
  ON notifications(company_id, project_id, dedupe_key)
  WHERE lifecycle_status = 'active'
    AND scope_type = 'project'
    AND company_id IS NOT NULL
    AND project_id IS NOT NULL
    AND dedupe_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_active_system_dedupe
  ON notifications(scope_type, dedupe_key)
  WHERE lifecycle_status = 'active'
    AND scope_type = 'system'
    AND company_id IS NULL
    AND project_id IS NULL
    AND dedupe_key IS NOT NULL;

-- ============================================================
-- Company_id auto-fill trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.fill_notification_company_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.project_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM projects WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_fill_notification_company_id ON notifications;
CREATE TRIGGER trigger_fill_notification_company_id
  BEFORE INSERT OR UPDATE ON notifications
  FOR EACH ROW
  WHEN (NEW.company_id IS NULL)
  EXECUTE FUNCTION public.fill_notification_company_id();

-- ============================================================
-- Backfill old notifications lifecycle_status from status/fields
-- ============================================================
UPDATE notifications SET lifecycle_status = 'archived'
  WHERE lifecycle_status = 'active'
    AND (status = 'archived' OR status = 'resolved' OR status = 'closed')
    AND source_entity_type != 'warning';

UPDATE notifications SET lifecycle_status = 'resolved'
  WHERE lifecycle_status = 'active'
    AND (resolved_at IS NOT NULL OR status = 'resolved')
    AND source_entity_type = 'warning';

UPDATE notifications SET lifecycle_status = 'archived'
  WHERE lifecycle_status = 'active'
    AND updated_at < NOW() - INTERVAL '90 days';

COMMIT;

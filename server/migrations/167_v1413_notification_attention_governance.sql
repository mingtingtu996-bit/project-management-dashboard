-- 167_v1413_notification_attention_governance.sql
-- Tighten active notification dedupe to the same touchpoint/scope projection口径.

BEGIN;

DROP INDEX IF EXISTS uq_notifications_active_project_dedupe;
DROP INDEX IF EXISTS uq_notifications_active_system_dedupe;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_active_touchpoint_dedupe
  ON notifications(
    COALESCE(company_id::text, 'no-company'),
    COALESCE(project_id::text, 'no-project'),
    scope_type,
    touchpoint_type,
    dedupe_key
  )
  WHERE lifecycle_status = 'active'
    AND dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_attention_project_today
  ON notifications(project_id, touchpoint_type, lifecycle_status, created_at DESC)
  WHERE lifecycle_status = 'active'
    AND touchpoint_type IN ('persistent', 'dashboard_todo', 'popup', 'page_banner');

COMMIT;

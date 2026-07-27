-- 168_v1413_notification_attention_state_due_and_reconcile.sql
-- Add user-state-aware due-date and reconciliation support for notification attention governance.

BEGIN;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS action_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciliation_source_status TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_attention_project_action_due
  ON notifications(project_id, touchpoint_type, lifecycle_status, (COALESCE(action_due_at, created_at)))
  WHERE lifecycle_status = 'active'
    AND touchpoint_type = 'dashboard_todo';

CREATE INDEX IF NOT EXISTS idx_notifications_attention_active_expiry
  ON notifications(project_id, lifecycle_status, expires_at)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS idx_notification_user_states_visible_attention
  ON notification_user_states(notification_id, user_id, is_hidden, is_muted, muted_until, is_read);

COMMIT;

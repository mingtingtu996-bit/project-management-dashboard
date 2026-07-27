-- 138_v1413_reminder_tables.sql
-- v1.4.13: Reminder preferences + dismissals tables

BEGIN;

CREATE TABLE IF NOT EXISTS reminder_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  reminder_days_before INT NOT NULL DEFAULT 3,
  popup_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_pref_user_project
  ON reminder_preferences(user_id, project_id);

CREATE TABLE IF NOT EXISTS reminder_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  source_entity_type TEXT,
  source_entity_id TEXT,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_dismiss_user
  ON reminder_dismissals(user_id, dismissed_at DESC);

CREATE INDEX IF NOT EXISTS idx_reminder_dismiss_source
  ON reminder_dismissals(source_entity_type, source_entity_id)
  WHERE source_entity_type IS NOT NULL AND source_entity_id IS NOT NULL;

COMMIT;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS assignee_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE tasks
SET assignee_user_id = assignee_id
WHERE assignee_user_id IS NULL
  AND assignee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_user_id
  ON tasks(assignee_user_id);

ALTER TABLE acceptance_plans
  ADD COLUMN IF NOT EXISTS responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_responsible_user_id
  ON acceptance_plans(responsible_user_id);

CREATE TABLE IF NOT EXISTS responsibility_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dimension VARCHAR(20) NOT NULL CHECK (dimension IN ('person', 'unit')),
  subject_key VARCHAR(255) NOT NULL,
  subject_label VARCHAR(255) NOT NULL,
  subject_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  subject_unit_id UUID NULL REFERENCES participant_units(id) ON DELETE SET NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suggested_to_clear', 'cleared')),
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_responsibility_watchlist_subject_unique
  ON responsibility_watchlist(project_id, dimension, subject_key);

CREATE INDEX IF NOT EXISTS idx_responsibility_watchlist_project_status
  ON responsibility_watchlist(project_id, status);

CREATE TABLE IF NOT EXISTS responsibility_alert_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dimension VARCHAR(20) NOT NULL CHECK (dimension IN ('person', 'unit')),
  subject_key VARCHAR(255) NOT NULL,
  subject_label VARCHAR(255) NOT NULL,
  subject_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  subject_unit_id UUID NULL REFERENCES participant_units(id) ON DELETE SET NULL,
  alert_type VARCHAR(64) NOT NULL DEFAULT 'responsibility_health',
  current_level VARCHAR(32) NOT NULL DEFAULT 'healthy' CHECK (current_level IN ('healthy', 'abnormal', 'recovered')),
  consecutive_unhealthy_periods INTEGER NOT NULL DEFAULT 0,
  consecutive_healthy_periods INTEGER NOT NULL DEFAULT 0,
  last_snapshot_week DATE NULL,
  last_message_id UUID NULL REFERENCES notifications(id) ON DELETE SET NULL,
  last_metrics JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_responsibility_alert_states_subject_unique
  ON responsibility_alert_states(project_id, dimension, subject_key, alert_type);

CREATE INDEX IF NOT EXISTS idx_responsibility_alert_states_project_level
  ON responsibility_alert_states(project_id, current_level);

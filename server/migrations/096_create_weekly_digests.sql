CREATE TABLE IF NOT EXISTS weekly_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  overall_progress NUMERIC(5,2),
  health_score INTEGER,
  progress_change NUMERIC(5,2),
  completed_tasks_count INTEGER DEFAULT 0,
  completed_milestones_count INTEGER DEFAULT 0,
  critical_tasks_count INTEGER DEFAULT 0,
  critical_blocked_count INTEGER DEFAULT 0,
  critical_nearest_milestone TEXT,
  critical_nearest_delay_days INTEGER,
  top_delayed_tasks JSONB DEFAULT '[]',
  abnormal_responsibilities JSONB DEFAULT '[]',
  new_risks_count INTEGER DEFAULT 0,
  new_obstacles_count INTEGER DEFAULT 0,
  max_risk_level TEXT,
  UNIQUE(project_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_digests_project_week
  ON weekly_digests(project_id, week_start DESC);

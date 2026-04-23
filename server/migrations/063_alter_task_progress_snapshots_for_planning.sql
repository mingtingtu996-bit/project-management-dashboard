BEGIN;

ALTER TABLE task_progress_snapshots
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS event_source VARCHAR(50),
  ADD COLUMN IF NOT EXISTS baseline_version_id UUID REFERENCES task_baselines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_plan_version_id UUID REFERENCES monthly_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS baseline_item_id UUID REFERENCES task_baseline_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_plan_item_id UUID REFERENCES monthly_plan_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planning_source_type VARCHAR(30) DEFAULT 'execution'
    CHECK (planning_source_type IN ('baseline', 'monthly_plan', 'current_schedule', 'execution')),
  ADD COLUMN IF NOT EXISTS planning_source_version_id UUID,
  ADD COLUMN IF NOT EXISTS planning_source_item_id UUID;

UPDATE task_progress_snapshots
SET
  event_type = COALESCE(event_type, 'task_update'),
  event_source = COALESCE(event_source, CASE WHEN is_auto_generated THEN 'system_auto' ELSE 'manual' END),
  planning_source_type = COALESCE(planning_source_type, 'execution');

COMMIT;

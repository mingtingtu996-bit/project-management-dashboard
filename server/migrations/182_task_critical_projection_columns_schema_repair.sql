-- 182_task_critical_projection_columns_schema_repair.sql
-- Live schema repair for v1.4 critical-path projection fields consumed by forecasts,
-- material reminders, and schedule acceleration runtime.

BEGIN;

ALTER TABLE IF EXISTS public.tasks
  ADD COLUMN IF NOT EXISTS baseline_is_critical BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS total_float_days INTEGER,
  ADD COLUMN IF NOT EXISTS free_float_days INTEGER,
  ADD COLUMN IF NOT EXISTS successor_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS milestone_distance_days INTEGER,
  ADD COLUMN IF NOT EXISTS downstream_milestone_distance_days INTEGER,
  ADD COLUMN IF NOT EXISTS criticality_weight NUMERIC(6,3) NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_tasks_project_baseline_critical
  ON public.tasks(project_id, baseline_is_critical)
  WHERE baseline_is_critical IS TRUE;

CREATE INDEX IF NOT EXISTS idx_tasks_project_criticality_float
  ON public.tasks(project_id, total_float_days, free_float_days);

CREATE INDEX IF NOT EXISTS idx_tasks_project_milestone_distance
  ON public.tasks(project_id, downstream_milestone_distance_days, milestone_distance_days);

COMMIT;

NOTIFY pgrst, 'reload schema';

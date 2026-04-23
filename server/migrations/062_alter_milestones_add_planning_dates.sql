BEGIN;

ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS baseline_date DATE,
  ADD COLUMN IF NOT EXISTS current_plan_date DATE,
  ADD COLUMN IF NOT EXISTS actual_date DATE;

UPDATE milestones
SET
  baseline_date = COALESCE(baseline_date, target_date),
  current_plan_date = COALESCE(current_plan_date, target_date),
  actual_date = COALESCE(actual_date, completed_at::date)
WHERE baseline_date IS NULL
   OR current_plan_date IS NULL
   OR actual_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_milestones_baseline_date ON milestones(baseline_date);
CREATE INDEX IF NOT EXISTS idx_milestones_current_plan_date ON milestones(current_plan_date);
CREATE INDEX IF NOT EXISTS idx_milestones_actual_date ON milestones(actual_date);

COMMIT;

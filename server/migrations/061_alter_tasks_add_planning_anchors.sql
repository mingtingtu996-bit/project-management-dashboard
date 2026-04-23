BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS baseline_item_id UUID REFERENCES task_baseline_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_plan_item_id UUID REFERENCES monthly_plan_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_baseline_item_id ON tasks(baseline_item_id);
CREATE INDEX IF NOT EXISTS idx_tasks_monthly_plan_item_id ON tasks(monthly_plan_item_id);

COMMIT;

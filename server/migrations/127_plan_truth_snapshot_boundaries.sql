-- 127_plan_truth_snapshot_boundaries.sql
-- v1.4-v1.4.7 completion: keep planning snapshots separate from current execution facts.

BEGIN;

-- Baseline rows are total-control commitment snapshots. They must preserve
-- the task facts used at generation/publish time instead of drifting with tasks.
ALTER TABLE task_baseline_items
  ADD COLUMN IF NOT EXISTS scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wbs_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_fact_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS status_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_source TEXT NOT NULL DEFAULT 'current_execution_fact',
  ADD COLUMN IF NOT EXISTS snapshot_captured_at TIMESTAMPTZ;

-- Monthly plan rows are monthly commitment snapshots. They either inherit a
-- baseline snapshot or capture current execution facts when generated directly.
ALTER TABLE monthly_plan_items
  ADD COLUMN IF NOT EXISTS scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wbs_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_fact_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS status_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_source TEXT NOT NULL DEFAULT 'baseline_commitment_snapshot',
  ADD COLUMN IF NOT EXISTS snapshot_captured_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_task_baseline_items_snapshot_source
  ON task_baseline_items(project_id, snapshot_source);

CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_snapshot_source
  ON monthly_plan_items(project_id, snapshot_source);

CREATE INDEX IF NOT EXISTS idx_task_baseline_items_scope_snapshot
  ON task_baseline_items USING GIN (scope_snapshot);

CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_scope_snapshot
  ON monthly_plan_items USING GIN (scope_snapshot);

-- Ensure the current migration's physical rules contain the plan snapshot links
-- used by v1.4.7 generation boundaries.
INSERT INTO data_lineage_relation_rules (source_entity_type, relation_type, target_entity_type)
VALUES
  ('task', 'generates', 'task_baseline_item'),
  ('task_baseline_item', 'derives', 'monthly_plan_item'),
  ('monthly_plan_item', 'carries_over_to', 'monthly_plan_item'),
  ('task', 'carries_over_to', 'monthly_plan_item')
ON CONFLICT (source_entity_type, relation_type, target_entity_type) DO NOTHING;

COMMIT;

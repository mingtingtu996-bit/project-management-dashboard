-- 135_v1472_template_lineage_fields.sql
-- v1.4.7.2 §13.7 + v1.4.7.3 §13.2: Template lineage fields on tasks and task_baselines

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source_template_id UUID,
  ADD COLUMN IF NOT EXISTS source_template_node_id UUID,
  ADD COLUMN IF NOT EXISTS generation_batch_id UUID;

ALTER TABLE task_baselines
  ADD COLUMN IF NOT EXISTS generation_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_tasks_generation_batch
  ON tasks(generation_batch_id) WHERE generation_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_source_template
  ON tasks(source_template_id) WHERE source_template_id IS NOT NULL;

COMMIT;

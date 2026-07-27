-- 150_v1418_duration_calibration_source.sql
-- v1.4.18: keep duration provenance separate from template structure and runtime facts.

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS duration_calibration_source TEXT,
  ADD COLUMN IF NOT EXISTS duration_provenance TEXT;

ALTER TABLE task_baseline_items
  ADD COLUMN IF NOT EXISTS duration_calibration_source TEXT,
  ADD COLUMN IF NOT EXISTS duration_provenance TEXT;

ALTER TABLE monthly_plan_items
  ADD COLUMN IF NOT EXISTS duration_calibration_source TEXT,
  ADD COLUMN IF NOT EXISTS duration_provenance TEXT;

ALTER TABLE wbs_template_nodes
  ADD COLUMN IF NOT EXISTS duration_calibration_source TEXT,
  ADD COLUMN IF NOT EXISTS duration_provenance TEXT;

ALTER TABLE duration_experience_samples
  ADD COLUMN IF NOT EXISTS duration_calibration_source TEXT;

ALTER TABLE duration_benchmarks
  ADD COLUMN IF NOT EXISTS duration_calibration_source TEXT;

ALTER TABLE task_duration_forecasts
  ADD COLUMN IF NOT EXISTS duration_calibration_source TEXT,
  ADD COLUMN IF NOT EXISTS duration_provenance TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_duration_provenance
  ON tasks(project_id, duration_calibration_source, duration_provenance);

CREATE INDEX IF NOT EXISTS idx_duration_benchmarks_calibration_source
  ON duration_benchmarks(duration_calibration_source, is_current, is_active);

COMMIT;

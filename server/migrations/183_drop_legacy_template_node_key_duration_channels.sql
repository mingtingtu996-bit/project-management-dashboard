-- 183_drop_legacy_template_node_key_duration_channels.sql
-- Remove retired duration lineage channel from current duration experience,
-- benchmark, and override tables. Current algorithms use template_node_id,
-- standard_work_code, and engineering_category_id only.

BEGIN;

ALTER TABLE duration_experience_samples
  DROP COLUMN IF EXISTS legacy_template_node_key;

ALTER TABLE duration_benchmarks
  DROP COLUMN IF EXISTS legacy_template_node_key;

ALTER TABLE duration_suggestion_overrides
  DROP COLUMN IF EXISTS legacy_template_node_key;

COMMIT;

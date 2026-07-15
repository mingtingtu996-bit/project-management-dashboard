-- 208_drop_legacy_duration_physical_cache_objects.sql
-- No-history physical cleanup for retired duration cache objects.
-- Current duration truth is the governed duration-output pipeline:
-- plan_reference/contextual_reference/remaining_forecast/project_remaining_forecast/phase_window/acceleration_target.

BEGIN;

ALTER TABLE IF EXISTS tasks
  DROP COLUMN IF EXISTS planned_duration,
  DROP COLUMN IF EXISTS standard_duration,
  DROP COLUMN IF EXISTS reference_duration,
  DROP COLUMN IF EXISTS ai_duration,
  DROP COLUMN IF EXISTS ai_adjusted_duration;

DROP TABLE IF EXISTS ai_duration_estimates CASCADE;

COMMIT;

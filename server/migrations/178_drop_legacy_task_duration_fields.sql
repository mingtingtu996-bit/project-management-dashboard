-- v1.4.18 duration smart reference closeout
-- Remove legacy task-level duration cache fields. Current duration truth is
-- produced by durationSuggestionService, task_duration_forecasts, and plan rows.
-- No-history environments physically remove retired estimate/cache objects in
-- 208_drop_legacy_duration_physical_cache_objects.sql.

ALTER TABLE IF EXISTS tasks
  DROP COLUMN IF EXISTS reference_duration,
  DROP COLUMN IF EXISTS ai_duration,
  DROP COLUMN IF EXISTS ai_adjusted_duration;

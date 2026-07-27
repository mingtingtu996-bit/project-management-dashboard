-- 190_add_execution_reference_days.sql
-- Separate execution-forecast reference duration from new-task reference duration.

BEGIN;

ALTER TABLE task_duration_forecasts
  ADD COLUMN IF NOT EXISTS execution_reference_days INT;

COMMENT ON COLUMN task_duration_forecasts.execution_reference_days IS
  'Reference duration used by execution remaining-duration forecast; does not replace task recommended_duration_days.';

COMMIT;

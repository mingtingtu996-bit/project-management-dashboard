-- 147_v1474_duration_context_fields.sql
-- v1.4.7.4 + v1.4.18: persist unified duration context and forecast outputs

BEGIN;

ALTER TABLE task_duration_forecasts
  ADD COLUMN IF NOT EXISTS remaining_duration_days INT,
  ADD COLUMN IF NOT EXISTS forecast_finish_date DATE,
  ADD COLUMN IF NOT EXISTS forecast_delay_days INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS factor_summary JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS calculation_context JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_duration_forecast_delay
  ON task_duration_forecasts(project_id, forecast_delay_days DESC, generated_at DESC)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_duration_forecast_context_adjusted_by
  ON task_duration_forecasts USING GIN (calculation_context);

COMMIT;

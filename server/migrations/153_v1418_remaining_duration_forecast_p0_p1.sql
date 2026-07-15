-- 153_v1418_remaining_duration_forecast_p0_p1.sql
-- v1.4.18: execution-task remaining duration forecast P0/P1 hardening

BEGIN;

ALTER TABLE task_duration_forecasts
  ADD COLUMN IF NOT EXISTS model_version TEXT NOT NULL DEFAULT 'remaining_duration_forecast_v1',
  ADD COLUMN IF NOT EXISTS weight_profile JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS delay_risk_index NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS forecast_error_days INT,
  ADD COLUMN IF NOT EXISTS forecast_error_recorded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_duration_forecast_error
  ON task_duration_forecasts(project_id, forecast_error_recorded_at DESC)
  WHERE forecast_error_days IS NOT NULL;

INSERT INTO duration_forecast_model_profiles (
  model_key,
  model_name,
  description,
  wbs_node_type,
  confidence_weight,
  metadata
) VALUES (
  'remaining_duration_forecast',
  '执行中任务剩余工期预测',
  '统一治理 SPI/EAC、近期速度、历史速度和参考工期候选权重',
  'process',
  1.0,
  jsonb_build_object(
    'modelVersion', 'remaining_duration_forecast_v1',
    'candidateWeights', jsonb_build_object(
      'L0', jsonb_build_object('reference_ratio', 1.0),
      'L1', jsonb_build_object('reference_ratio', 0.30, 'spi_eac', 0.35, 'recent_velocity', 0.35),
      'L2', jsonb_build_object('reference_ratio', 0.15, 'spi_eac', 0.30, 'recent_velocity', 0.35, 'history_velocity', 0.20)
    ),
    'confidencePolicy', jsonb_build_object(
      'usesForecastSpecificConfidence', true,
      'usesSnapshotQualityPenalty', true,
      'usesPlanDueRiskPenalty', true,
      'usesForecastErrorBackfill', true
    )
  )
) ON CONFLICT (model_key) DO UPDATE
SET
  description = EXCLUDED.description,
  confidence_weight = EXCLUDED.confidence_weight,
  metadata = EXCLUDED.metadata
WHERE duration_forecast_model_profiles.metadata = '{}'::jsonb
   OR NOT (duration_forecast_model_profiles.metadata ? 'candidateWeights');

COMMIT;

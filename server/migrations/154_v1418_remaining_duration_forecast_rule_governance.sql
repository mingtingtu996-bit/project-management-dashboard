-- 154_v1418_remaining_duration_forecast_rule_governance.sql
-- v1.4.18 / v1.4.22: govern remaining-duration forecast weights, progress curves and trigger contexts.

BEGIN;

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
  '统一治理 SPI/EAC、近期速度、历史速度、进度曲线、长尾兜底和调用场景',
  'process',
  1.0,
  jsonb_build_object(
    'modelVersion', 'remaining_duration_forecast_v1.1',
    'candidateWeights', jsonb_build_object(
      'L0', jsonb_build_object('reference_ratio', 1.0),
      'L1', jsonb_build_object('reference_ratio', 0.30, 'spi_eac', 0.35, 'recent_velocity', 0.35),
      'L2', jsonb_build_object('reference_ratio', 0.15, 'spi_eac', 0.30, 'recent_velocity', 0.35, 'history_velocity', 0.20)
    ),
    'progressCurvePolicies', jsonb_build_object(
      'linear', jsonb_build_array(jsonb_build_object('multiplier', 1.0)),
      'front_heavy', jsonb_build_array(
        jsonb_build_object('minProgress', 85, 'multiplier', 1.60),
        jsonb_build_object('minProgress', 70, 'multiplier', 1.35),
        jsonb_build_object('maxProgress', 25, 'multiplier', 0.95),
        jsonb_build_object('multiplier', 1.0)
      ),
      'back_heavy', jsonb_build_array(
        jsonb_build_object('minProgress', 80, 'multiplier', 1.50),
        jsonb_build_object('minProgress', 50, 'multiplier', 1.25),
        jsonb_build_object('multiplier', 1.10)
      ),
      's_curve', jsonb_build_array(
        jsonb_build_object('minProgress', 85, 'multiplier', 1.15),
        jsonb_build_object('maxProgress', 20, 'multiplier', 1.15),
        jsonb_build_object('minProgress', 35, 'maxProgress', 70, 'multiplier', 0.95),
        jsonb_build_object('multiplier', 1.0)
      )
    ),
    'stuckFinishingPolicies', jsonb_build_object(
      'linear', jsonb_build_object('progressThreshold', 90, 'stuckDaysThreshold', 14, 'floorDays', 7, 'criticalStuckDaysThreshold', 28, 'criticalFloorDays', 14),
      'front_heavy', jsonb_build_object('progressThreshold', 85, 'stuckDaysThreshold', 7, 'floorDays', 5, 'criticalStuckDaysThreshold', 28, 'criticalFloorDays', 14),
      'back_heavy', jsonb_build_object('progressThreshold', 75, 'stuckDaysThreshold', 5, 'floorDays', 7, 'criticalStuckDaysThreshold', 21, 'criticalFloorDays', 14),
      's_curve', jsonb_build_object('progressThreshold', 85, 'stuckDaysThreshold', 7, 'floorDays', 10, 'criticalStuckDaysThreshold', 28, 'criticalFloorDays', 14)
    ),
    'impactModes', jsonb_build_object(
      'blocking_start', jsonb_build_array('dependency_unfinished', 'material_expected_arrival', 'critical_obstacle_resolve_date'),
      'add_days', jsonb_build_array('process_wait', 'major_obstacle', 'external_readiness'),
      'multiplier', jsonb_build_array('obstacle_combination', 'resource_conflict', 'process_constraint'),
      'confidence_only', jsonb_build_array('low_quality_site_signal', 'stale_dependency_forecast', 'unknown_resolve_date')
    ),
    'triggerContexts', jsonb_build_object(
      'daily_dashboard_refresh', jsonb_build_object('precisionLevel', 'fast', 'useCache', true, 'writePolicy', 'update_current', 'dependencyDepth', 1),
      'user_clicked_refresh', jsonb_build_object('precisionLevel', 'accurate', 'useCache', false, 'writePolicy', 'insert_history', 'dependencyDepth', 2),
      'task_progress_changed', jsonb_build_object('precisionLevel', 'balanced', 'useCache', false, 'writePolicy', 'insert_history', 'dependencyDepth', 1),
      'monthly_plan_regeneration', jsonb_build_object('precisionLevel', 'balanced', 'useCache', true, 'writePolicy', 'insert_history', 'dependencyDepth', 2),
      'baseline_regeneration', jsonb_build_object('precisionLevel', 'balanced', 'useCache', true, 'writePolicy', 'insert_history', 'dependencyDepth', 2),
      'system_batch', jsonb_build_object('precisionLevel', 'fast', 'useCache', true, 'writePolicy', 'update_current', 'dependencyDepth', 1)
    ),
    'confidencePolicy', jsonb_build_object(
      'usesForecastSpecificConfidence', true,
      'usesSnapshotQualityPenalty', true,
      'usesPlanDueRiskPenalty', true,
      'usesDependencyFreshnessPenalty', true,
      'usesForecastErrorBackfill', true
    )
  )
) ON CONFLICT (model_key) DO UPDATE
SET
  model_name = EXCLUDED.model_name,
  description = EXCLUDED.description,
  confidence_weight = EXCLUDED.confidence_weight,
  metadata = duration_forecast_model_profiles.metadata
    || jsonb_build_object(
      'modelVersion', 'remaining_duration_forecast_v1.1',
      'candidateWeights', EXCLUDED.metadata -> 'candidateWeights',
      'progressCurvePolicies', EXCLUDED.metadata -> 'progressCurvePolicies',
      'stuckFinishingPolicies', EXCLUDED.metadata -> 'stuckFinishingPolicies',
      'impactModes', EXCLUDED.metadata -> 'impactModes',
      'triggerContexts', EXCLUDED.metadata -> 'triggerContexts',
      'confidencePolicy', EXCLUDED.metadata -> 'confidencePolicy'
    );

COMMIT;

-- 155_v1418_unstarted_overdue_earliest_start_rule_seed.sql
-- v1.4.18 / v1.4.22: register the internal rule seed for unstarted overdue remaining-duration forecasts.

BEGIN;

DO $$
DECLARE
  v_version_id UUID;
BEGIN
  UPDATE public.algorithm_seed_versions
  SET
    is_current = FALSE,
    status = CASE WHEN status = 'active' THEN 'deprecated' ELSE status END,
    updated_at = NOW()
  WHERE seed_type = 'earliest_start_rule'
    AND seed_version <> 'v1.4.18-unstarted-overdue-20260517'
    AND is_current = TRUE;

  INSERT INTO public.algorithm_seed_versions (
    seed_type,
    seed_version,
    seed_scope,
    source_standards,
    expected_counts,
    evidence_sources,
    validation_result,
    status,
    is_current,
    published_at
  ) VALUES (
    'earliest_start_rule',
    'v1.4.18-unstarted-overdue-20260517',
    'algorithm_auxiliary',
    jsonb_build_array('WorkBuddy v1.4.18 remaining duration forecast rule'),
    jsonb_build_object('records', 1),
    jsonb_build_array(jsonb_build_object(
      'sourceKey', 'workbuddy_v1418_remaining_duration_rule',
      'title', 'WorkBuddy v1.4.18 remaining duration forecast rule',
      'url', 'docs/plans/v1.4.18模板库与经验工期体系执行方案.md',
      'accessedAt', '2026-05-17'
    )),
    jsonb_build_object(
      'ok', TRUE,
      'note', 'Internal system rule seed; webVerified=false by design.'
    ),
    'active',
    TRUE,
    NOW()
  )
  ON CONFLICT (seed_type, seed_version) DO UPDATE
  SET
    seed_scope = EXCLUDED.seed_scope,
    source_standards = EXCLUDED.source_standards,
    expected_counts = EXCLUDED.expected_counts,
    evidence_sources = EXCLUDED.evidence_sources,
    validation_result = EXCLUDED.validation_result,
    status = 'active',
    is_current = TRUE,
    published_at = COALESCE(public.algorithm_seed_versions.published_at, NOW()),
    updated_at = NOW()
  RETURNING id INTO v_version_id;

  INSERT INTO public.algorithm_seed_records (
    seed_version_id,
    seed_type,
    stable_code,
    rule_payload,
    source_standard,
    source_version,
    source_clause_ref,
    evidence_source_keys,
    confidence,
    web_verified,
    review_needed,
    status
  ) VALUES (
    v_version_id,
    'earliest_start_rule',
    'unstarted_overdue_default',
    jsonb_build_object(
      'stableCode', 'unstarted_overdue_default',
      'ruleName', 'Unstarted overdue earliest start rule',
      'scenario', 'unstarted_overdue',
      'appliesWhen', jsonb_build_object(
        'progressEquals', 0,
        'actualStartDateMissing', TRUE,
        'plannedStartOrEndPast', TRUE
      ),
      'knownDateSources', jsonb_build_object(
        'dependencyForecastFinish', TRUE,
        'materialExpectedArrival', TRUE,
        'criticalObstacleEstimatedResolve', TRUE
      ),
      'unknownBlockerPolicy', jsonb_build_object(
        'hardConditionWithoutDate', 'confidence_only',
        'drawingWithoutDate', 'confidence_only',
        'acceptanceWithoutDate', 'confidence_only',
        'materialWithoutDate', 'confidence_only',
        'criticalObstacleWithoutResolveDate', 'confidence_only'
      ),
      'missedStartPolicy', jsonb_build_object(
        'riskIndexDelta', 0.12,
        'confidencePenaltyBase', 8,
        'confidencePenaltyPerFiveWorkdays', 2
      ),
      'unknownBlockerPenalty', jsonb_build_object(
        'confidencePenaltyPerItem', 4,
        'riskIndexDeltaPerItem', 0.04
      ),
      'unstartedOverdueRiskPolicy', jsonb_build_object(
        'missedWindowRiskBase', 0.35,
        'missedWindowRiskWindowWorkdays', 30,
        'criticalUnknownRiskIndexDelta', 0.2,
        'dependencyUnknownRiskIndexDelta', 0.2,
        'materialUnknownRiskIndexDelta', 0.15,
        'unknownDateRiskIndexDeltaPerItem', 0.1
      ),
      'referenceStalenessPolicy', jsonb_build_object(
        'warningRatio', 0.5,
        'criticalRatio', 1,
        'warningConfidenceDelta', -8,
        'criticalConfidenceDelta', -16,
        'warningRiskIndexDelta', 0.06,
        'criticalRiskIndexDelta', 0.12
      ),
      'forecastPolicy', jsonb_build_object(
        'baseExecutionDaysSource', 'durationSuggestionService.execution_reference',
        'noHistoryMaturityModel', TRUE,
        'doNotAddUnknownDateDays', TRUE,
        'exposeOnlyBusinessReasons', TRUE
      ),
      'sourceStandard', 'system_default',
      'sourceVersion', 'WorkBuddy v1.4.18 remaining duration forecast rule',
      'sourceClauseRef', 'Unstarted overdue tasks use earliest known start date plus execution reference duration.',
      'evidenceSourceKeys', jsonb_build_array('workbuddy_v1418_remaining_duration_rule'),
      'webVerified', FALSE,
      'reviewNeeded', FALSE,
      'confidence', 'medium'
    ),
    'system_default',
    'WorkBuddy v1.4.18 remaining duration forecast rule',
    'Unstarted overdue tasks use earliest known start date plus execution reference duration.',
    jsonb_build_array('workbuddy_v1418_remaining_duration_rule'),
    'medium',
    FALSE,
    FALSE,
    'active'
  )
  ON CONFLICT (seed_version_id, stable_code) DO UPDATE
  SET
    rule_payload = EXCLUDED.rule_payload,
    source_standard = EXCLUDED.source_standard,
    source_version = EXCLUDED.source_version,
    source_clause_ref = EXCLUDED.source_clause_ref,
    evidence_source_keys = EXCLUDED.evidence_source_keys,
    confidence = EXCLUDED.confidence,
    web_verified = EXCLUDED.web_verified,
    review_needed = EXCLUDED.review_needed,
    status = 'active',
    updated_at = NOW();
END $$;

COMMIT;

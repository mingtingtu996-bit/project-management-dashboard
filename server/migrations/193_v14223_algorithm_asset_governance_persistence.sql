-- v1.4.22.3: rule/seed/algorithm asset company isolation and self-learning persistence.
-- These tables are backend governance surfaces. Ordinary business pages consume only published runtime outputs.

BEGIN;

CREATE TABLE IF NOT EXISTS public.algorithm_asset_candidate_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key TEXT NOT NULL,
  source_module TEXT NOT NULL,
  source_event_id TEXT NULL,
  scope_level TEXT NOT NULL
    CHECK (scope_level IN ('system', 'industry_baseline', 'segment_baseline', 'company', 'project')),
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  learning_target TEXT NOT NULL DEFAULT 'governance_policy'
    CHECK (learning_target IN ('base_duration', 'forecast_residual', 'context_factor', 'confidence', 'candidate_weight', 'template_structure', 'dependency_order', 'metric_caliber', 'risk_warning', 'governance_report', 'governance_policy')),
  learning_maturity TEXT NOT NULL DEFAULT 'governed_candidate'
    CHECK (learning_maturity IN ('frozen_constant', 'shadow_report_only', 'governed_candidate', 'guarded_live_tuning', 'system_curated_learning')),
  publish_anchor TEXT NOT NULL DEFAULT 'candidate_only'
    CHECK (publish_anchor IN ('candidate_only', 'manual_governance_required', 'trusted_source_auto_publish', 'guarded_runtime_auto_publish', 'system_curated_publish')),
  automation_maturity TEXT NOT NULL DEFAULT 'manual_required'
    CHECK (automation_maturity IN ('manual_required', 'auto_review_package', 'auto_shadow', 'auto_canary', 'auto_publish')),
  event_status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (event_status IN ('observed', 'candidate', 'replay_ready', 'review_required', 'published', 'quarantined', 'rejected', 'superseded')),
  candidate_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  runtime_effect TEXT NOT NULL DEFAULT 'backend_governance_only',
  rollback_target JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT algorithm_asset_candidate_events_scope_consistency CHECK (
    (
      scope_level IN ('system', 'industry_baseline', 'segment_baseline')
      AND company_id IS NULL
      AND project_id IS NULL
    )
    OR (
      scope_level = 'company'
      AND company_id IS NOT NULL
      AND project_id IS NULL
    )
    OR (
      scope_level = 'project'
      AND company_id IS NOT NULL
      AND project_id IS NOT NULL
    )
  ),
  CONSTRAINT algorithm_asset_candidate_events_no_deleted_range_tree_fields CHECK (
    LOWER(candidate_payload::text) NOT LIKE '%zone_object_id%'
    AND LOWER(candidate_payload::text) NOT LIKE '%professional_object_id%'
    AND LOWER(candidate_payload::text) NOT LIKE '%scope_dimensions%'
    AND LOWER(candidate_payload::text) NOT LIKE '%project_scope_dimensions%'
    AND LOWER(candidate_payload::text) NOT LIKE '%legacy_object_type%'
  )
);

CREATE INDEX IF NOT EXISTS idx_algorithm_asset_candidate_events_scope
  ON public.algorithm_asset_candidate_events(scope_level, company_id, project_id, event_status);
CREATE INDEX IF NOT EXISTS idx_algorithm_asset_candidate_events_asset
  ON public.algorithm_asset_candidate_events(asset_key, source_module, created_at DESC);

CREATE TABLE IF NOT EXISTS public.algorithm_asset_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conflict_key TEXT NOT NULL,
  candidate_event_id UUID NULL REFERENCES public.algorithm_asset_candidate_events(id) ON DELETE SET NULL,
  conflict_type TEXT NOT NULL
    CHECK (conflict_type IN ('semantic_conflict', 'scope_escalation', 'published_override_conflict', 'stacking_risk', 'legacy_object_pollution')),
  current_asset_key TEXT NOT NULL,
  challenger_asset_key TEXT NOT NULL,
  scope_level TEXT NOT NULL
    CHECK (scope_level IN ('system', 'industry_baseline', 'segment_baseline', 'company', 'project')),
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  publish_anchor TEXT NOT NULL DEFAULT 'manual_governance_required'
    CHECK (publish_anchor IN ('candidate_only', 'manual_governance_required', 'trusted_source_auto_publish', 'guarded_runtime_auto_publish', 'system_curated_publish')),
  automation_maturity TEXT NOT NULL DEFAULT 'manual_required'
    CHECK (automation_maturity IN ('manual_required', 'auto_review_package', 'auto_shadow', 'auto_canary', 'auto_publish')),
  learning_maturity TEXT NOT NULL DEFAULT 'shadow_report_only'
    CHECK (learning_maturity IN ('frozen_constant', 'shadow_report_only', 'governed_candidate', 'guarded_live_tuning', 'system_curated_learning')),
  learning_target TEXT NOT NULL DEFAULT 'governance_policy'
    CHECK (learning_target IN ('base_duration', 'forecast_residual', 'context_factor', 'confidence', 'candidate_weight', 'template_structure', 'dependency_order', 'metric_caliber', 'risk_warning', 'governance_report', 'governance_policy')),
  conflict_status TEXT NOT NULL DEFAULT 'review_required'
    CHECK (conflict_status IN ('review_required', 'quarantined', 'shadow_compare_only', 'no_conflict_publish_allowed', 'resolved', 'superseded')),
  conflict_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution_policy TEXT NOT NULL DEFAULT 'manual_governance_required',
  rollback_target JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT algorithm_asset_conflicts_scope_consistency CHECK (
    (
      scope_level IN ('system', 'industry_baseline', 'segment_baseline')
      AND company_id IS NULL
      AND project_id IS NULL
    )
    OR (
      scope_level = 'company'
      AND company_id IS NOT NULL
      AND project_id IS NULL
    )
    OR (
      scope_level = 'project'
      AND company_id IS NOT NULL
      AND project_id IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_algorithm_asset_conflicts_key
  ON public.algorithm_asset_conflicts(conflict_key);
CREATE INDEX IF NOT EXISTS idx_algorithm_asset_conflicts_scope
  ON public.algorithm_asset_conflicts(scope_level, company_id, project_id, conflict_status);

CREATE TABLE IF NOT EXISTS public.algorithm_asset_replay_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  source_module TEXT NOT NULL,
  scope_level TEXT NOT NULL
    CHECK (scope_level IN ('system', 'industry_baseline', 'segment_baseline', 'company', 'project')),
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  learning_target TEXT NOT NULL DEFAULT 'governance_policy'
    CHECK (learning_target IN ('base_duration', 'forecast_residual', 'context_factor', 'confidence', 'candidate_weight', 'template_structure', 'dependency_order', 'metric_caliber', 'risk_warning', 'governance_report', 'governance_policy')),
  learning_maturity TEXT NOT NULL DEFAULT 'shadow_report_only'
    CHECK (learning_maturity IN ('frozen_constant', 'shadow_report_only', 'governed_candidate', 'guarded_live_tuning', 'system_curated_learning')),
  publish_anchor TEXT NOT NULL DEFAULT 'candidate_only'
    CHECK (publish_anchor IN ('candidate_only', 'manual_governance_required', 'trusted_source_auto_publish', 'guarded_runtime_auto_publish', 'system_curated_publish')),
  automation_maturity TEXT NOT NULL DEFAULT 'manual_required'
    CHECK (automation_maturity IN ('manual_required', 'auto_review_package', 'auto_shadow', 'auto_canary', 'auto_publish')),
  replay_mode TEXT NOT NULL DEFAULT 'shadow_report_only'
    CHECK (replay_mode IN ('shadow_report_only', 'canary_evaluation', 'release_gate')),
  sample_count INTEGER NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  run_status TEXT NOT NULL DEFAULT 'running'
    CHECK (run_status IN ('running', 'passed', 'failed', 'blocked', 'quarantined')),
  replay_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  rollback_target JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT algorithm_asset_replay_runs_scope_consistency CHECK (
    (
      scope_level IN ('system', 'industry_baseline', 'segment_baseline')
      AND company_id IS NULL
      AND project_id IS NULL
    )
    OR (
      scope_level = 'company'
      AND company_id IS NOT NULL
      AND project_id IS NULL
    )
    OR (
      scope_level = 'project'
      AND company_id IS NOT NULL
      AND project_id IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_algorithm_asset_replay_runs_key
  ON public.algorithm_asset_replay_runs(run_key);
CREATE INDEX IF NOT EXISTS idx_algorithm_asset_replay_runs_scope
  ON public.algorithm_asset_replay_runs(scope_level, company_id, project_id, run_status);

CREATE TABLE IF NOT EXISTS public.algorithm_asset_replay_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  replay_run_id UUID NOT NULL REFERENCES public.algorithm_asset_replay_runs(id) ON DELETE CASCADE,
  candidate_event_id UUID NULL REFERENCES public.algorithm_asset_candidate_events(id) ON DELETE SET NULL,
  asset_key TEXT NOT NULL,
  scope_level TEXT NOT NULL
    CHECK (scope_level IN ('system', 'industry_baseline', 'segment_baseline', 'company', 'project')),
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  learning_target TEXT NOT NULL DEFAULT 'governance_policy'
    CHECK (learning_target IN ('base_duration', 'forecast_residual', 'context_factor', 'confidence', 'candidate_weight', 'template_structure', 'dependency_order', 'metric_caliber', 'risk_warning', 'governance_report', 'governance_policy')),
  learning_maturity TEXT NOT NULL DEFAULT 'shadow_report_only'
    CHECK (learning_maturity IN ('frozen_constant', 'shadow_report_only', 'governed_candidate', 'guarded_live_tuning', 'system_curated_learning')),
  publish_anchor TEXT NOT NULL DEFAULT 'candidate_only'
    CHECK (publish_anchor IN ('candidate_only', 'manual_governance_required', 'trusted_source_auto_publish', 'guarded_runtime_auto_publish', 'system_curated_publish')),
  automation_maturity TEXT NOT NULL DEFAULT 'manual_required'
    CHECK (automation_maturity IN ('manual_required', 'auto_review_package', 'auto_shadow', 'auto_canary', 'auto_publish')),
  original_error NUMERIC NULL,
  overlay_error NUMERIC NULL,
  mae_improvement_ratio NUMERIC NULL,
  overcompensation_ratio NUMERIC NULL,
  runtime_impact TEXT NOT NULL DEFAULT 'none'
    CHECK (runtime_impact IN ('none', 'shadow_only', 'canary_candidate', 'published_version_candidate')),
  result_status TEXT NOT NULL DEFAULT 'shadow_only'
    CHECK (result_status IN ('shadow_only', 'replay_passed', 'replay_failed', 'review_required', 'quarantined')),
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  rollback_target JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT algorithm_asset_replay_results_scope_consistency CHECK (
    (
      scope_level IN ('system', 'industry_baseline', 'segment_baseline')
      AND company_id IS NULL
      AND project_id IS NULL
    )
    OR (
      scope_level = 'company'
      AND company_id IS NOT NULL
      AND project_id IS NULL
    )
    OR (
      scope_level = 'project'
      AND company_id IS NOT NULL
      AND project_id IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_algorithm_asset_replay_results_run
  ON public.algorithm_asset_replay_results(replay_run_id, result_status);
CREATE INDEX IF NOT EXISTS idx_algorithm_asset_replay_results_scope
  ON public.algorithm_asset_replay_results(scope_level, company_id, project_id, result_status);

CREATE TABLE IF NOT EXISTS public.algorithm_learnable_parameter_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_key TEXT NOT NULL,
  owner_algorithm TEXT NOT NULL,
  scope_level TEXT NOT NULL
    CHECK (scope_level IN ('system', 'industry_baseline', 'segment_baseline', 'company', 'project')),
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  learning_target TEXT NOT NULL DEFAULT 'governance_policy'
    CHECK (learning_target IN ('base_duration', 'forecast_residual', 'context_factor', 'confidence', 'candidate_weight', 'template_structure', 'dependency_order', 'metric_caliber', 'risk_warning', 'governance_report', 'governance_policy')),
  learning_maturity TEXT NOT NULL DEFAULT 'frozen_constant'
    CHECK (learning_maturity IN ('frozen_constant', 'shadow_report_only', 'governed_candidate', 'guarded_live_tuning', 'system_curated_learning')),
  publish_anchor TEXT NOT NULL DEFAULT 'candidate_only'
    CHECK (publish_anchor IN ('candidate_only', 'manual_governance_required', 'trusted_source_auto_publish', 'guarded_runtime_auto_publish', 'system_curated_publish')),
  automation_maturity TEXT NOT NULL DEFAULT 'manual_required'
    CHECK (automation_maturity IN ('manual_required', 'auto_review_package', 'auto_shadow', 'auto_canary', 'auto_publish')),
  current_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_required JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_delta_per_release NUMERIC NULL,
  rollback_target JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_level TEXT NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high')),
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT algorithm_learnable_parameter_registry_scope_consistency CHECK (
    (
      scope_level IN ('system', 'industry_baseline', 'segment_baseline')
      AND company_id IS NULL
      AND project_id IS NULL
    )
    OR (
      scope_level = 'company'
      AND company_id IS NOT NULL
      AND project_id IS NULL
    )
    OR (
      scope_level = 'project'
      AND company_id IS NOT NULL
      AND project_id IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_algorithm_learnable_parameter_registry_unique_scope
  ON public.algorithm_learnable_parameter_registry (
    parameter_key,
    scope_level,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
CREATE INDEX IF NOT EXISTS idx_algorithm_learnable_parameter_registry_scope
  ON public.algorithm_learnable_parameter_registry(scope_level, company_id, project_id, learning_maturity);

CREATE TABLE IF NOT EXISTS public.algorithm_cold_start_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_key TEXT NOT NULL,
  segment_key TEXT NOT NULL,
  scope_level TEXT NOT NULL DEFAULT 'segment_baseline'
    CHECK (scope_level IN ('industry_baseline', 'segment_baseline')),
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  learning_target TEXT NOT NULL DEFAULT 'base_duration'
    CHECK (learning_target IN ('base_duration', 'forecast_residual', 'context_factor', 'confidence', 'candidate_weight', 'template_structure', 'dependency_order', 'metric_caliber', 'risk_warning', 'governance_report', 'governance_policy')),
  learning_maturity TEXT NOT NULL DEFAULT 'system_curated_learning'
    CHECK (learning_maturity IN ('frozen_constant', 'shadow_report_only', 'governed_candidate', 'guarded_live_tuning', 'system_curated_learning')),
  publish_anchor TEXT NOT NULL DEFAULT 'system_curated_publish'
    CHECK (publish_anchor IN ('candidate_only', 'manual_governance_required', 'trusted_source_auto_publish', 'guarded_runtime_auto_publish', 'system_curated_publish')),
  automation_maturity TEXT NOT NULL DEFAULT 'manual_required'
    CHECK (automation_maturity IN ('manual_required', 'auto_review_package', 'auto_shadow', 'auto_canary', 'auto_publish')),
  anonymization_policy TEXT NOT NULL DEFAULT 'anonymized_multi_company_aggregation',
  minimum_company_count INTEGER NOT NULL CHECK (minimum_company_count >= 2),
  minimum_project_count INTEGER NOT NULL CHECK (minimum_project_count >= 2),
  max_single_company_share NUMERIC NOT NULL CHECK (max_single_company_share > 0 AND max_single_company_share <= 0.5),
  baseline_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  disabled_scenarios JSONB NOT NULL DEFAULT '[]'::jsonb,
  rollback_target JSONB NOT NULL DEFAULT '{}'::jsonb,
  runtime_publication_status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (runtime_publication_status IN ('candidate', 'canary', 'published', 'runtime_rolled_back')),
  rollback_execution JSONB NULL,
  rolled_back_at TIMESTAMPTZ NULL,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT algorithm_cold_start_baselines_anonymized_shared_scope CHECK (
    company_id IS NULL
    AND project_id IS NULL
    AND anonymization_policy = 'anonymized_multi_company_aggregation'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_algorithm_cold_start_baselines_unique_segment
  ON public.algorithm_cold_start_baselines(baseline_key, segment_key);
CREATE INDEX IF NOT EXISTS idx_algorithm_cold_start_baselines_segment
  ON public.algorithm_cold_start_baselines(scope_level, segment_key, minimum_company_count, minimum_project_count);
CREATE INDEX IF NOT EXISTS idx_algorithm_cold_start_baselines_runtime_status
  ON public.algorithm_cold_start_baselines(scope_level, segment_key, runtime_publication_status);

CREATE TABLE IF NOT EXISTS public.duration_forecast_residual_overlays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  overlay_key TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  scope_level TEXT NOT NULL
    CHECK (scope_level IN ('company', 'project')),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  learning_target TEXT NOT NULL DEFAULT 'forecast_residual'
    CHECK (learning_target IN ('base_duration', 'forecast_residual', 'context_factor', 'confidence', 'candidate_weight', 'template_structure', 'dependency_order', 'metric_caliber', 'risk_warning', 'governance_report', 'governance_policy')),
  learning_maturity TEXT NOT NULL DEFAULT 'governed_candidate'
    CHECK (learning_maturity IN ('frozen_constant', 'shadow_report_only', 'governed_candidate', 'guarded_live_tuning', 'system_curated_learning')),
  publish_anchor TEXT NOT NULL DEFAULT 'candidate_only'
    CHECK (publish_anchor IN ('candidate_only', 'manual_governance_required', 'trusted_source_auto_publish', 'guarded_runtime_auto_publish', 'system_curated_publish')),
  automation_maturity TEXT NOT NULL DEFAULT 'manual_required'
    CHECK (automation_maturity IN ('manual_required', 'auto_review_package', 'auto_shadow', 'auto_canary', 'auto_publish')),
  original_mae NUMERIC NOT NULL CHECK (original_mae >= 0),
  overlay_mae NUMERIC NOT NULL CHECK (overlay_mae >= 0),
  mae_improvement_ratio NUMERIC NOT NULL DEFAULT 0,
  overcompensation_ratio NUMERIC NOT NULL DEFAULT 0 CHECK (overcompensation_ratio >= 0),
  residual_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  writes_base_duration_seed BOOLEAN NOT NULL DEFAULT false,
  target_table TEXT NOT NULL DEFAULT 'duration_forecast_residual_overlays',
  rollback_target JSONB NOT NULL DEFAULT '{}'::jsonb,
  runtime_publication_status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (runtime_publication_status IN ('candidate', 'canary', 'published', 'runtime_rolled_back')),
  rollback_execution JSONB NULL,
  rolled_back_at TIMESTAMPTZ NULL,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT duration_forecast_residual_overlays_scope_consistency CHECK (
    (
      scope_level = 'company'
      AND company_id IS NOT NULL
      AND project_id IS NULL
    )
    OR (
      scope_level = 'project'
      AND company_id IS NOT NULL
      AND project_id IS NOT NULL
    )
  ),
  CONSTRAINT duration_forecast_residual_overlays_no_base_seed_mutation CHECK (
    writes_base_duration_seed = false
    AND target_table = 'duration_forecast_residual_overlays'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_duration_forecast_residual_overlays_key
  ON public.duration_forecast_residual_overlays(overlay_key);
CREATE INDEX IF NOT EXISTS idx_duration_forecast_residual_overlays_scope
  ON public.duration_forecast_residual_overlays(scope_level, company_id, project_id, learning_maturity);
CREATE INDEX IF NOT EXISTS idx_duration_forecast_residual_overlays_runtime_status
  ON public.duration_forecast_residual_overlays(scope_level, company_id, project_id, runtime_publication_status);

CREATE TABLE IF NOT EXISTS public.algorithm_sample_health_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_key TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  source_module TEXT NOT NULL,
  scope_level TEXT NOT NULL
    CHECK (scope_level IN ('company', 'project')),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  learning_target TEXT NOT NULL DEFAULT 'governance_policy'
    CHECK (learning_target IN ('base_duration', 'forecast_residual', 'context_factor', 'confidence', 'candidate_weight', 'template_structure', 'dependency_order', 'metric_caliber', 'risk_warning', 'governance_report', 'governance_policy')),
  learning_maturity TEXT NOT NULL DEFAULT 'governed_candidate'
    CHECK (learning_maturity IN ('frozen_constant', 'shadow_report_only', 'governed_candidate', 'guarded_live_tuning', 'system_curated_learning')),
  publish_anchor TEXT NOT NULL DEFAULT 'candidate_only'
    CHECK (publish_anchor IN ('candidate_only', 'manual_governance_required', 'trusted_source_auto_publish', 'guarded_runtime_auto_publish', 'system_curated_publish')),
  automation_maturity TEXT NOT NULL DEFAULT 'manual_required'
    CHECK (automation_maturity IN ('manual_required', 'auto_review_package', 'auto_shadow', 'auto_canary', 'auto_publish')),
  sample_status TEXT NOT NULL
    CHECK (sample_status IN ('accepted', 'weak', 'rejected')),
  rejection_reason TEXT NULL,
  downgrade_reason TEXT NULL,
  completion_fact_quality JSONB NOT NULL DEFAULT '{}'::jsonb,
  supplement_suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT algorithm_sample_health_events_scope_consistency CHECK (
    (
      scope_level = 'company'
      AND company_id IS NOT NULL
      AND project_id IS NULL
    )
    OR (
      scope_level = 'project'
      AND company_id IS NOT NULL
      AND project_id IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_algorithm_sample_health_events_scope
  ON public.algorithm_sample_health_events(scope_level, company_id, project_id, sample_status);
CREATE INDEX IF NOT EXISTS idx_algorithm_sample_health_events_asset
  ON public.algorithm_sample_health_events(asset_key, source_module, created_at DESC);

CREATE OR REPLACE VIEW public.algorithm_asset_registry_view AS
SELECT
  'candidate_event'::text AS asset_surface,
  id::text AS asset_id,
  asset_key,
  source_module,
  scope_level,
  company_id,
  project_id,
  learning_target,
  learning_maturity,
  publish_anchor,
  automation_maturity,
  event_status AS lifecycle_status,
  runtime_effect,
  record_visibility_policy,
  created_at,
  updated_at
FROM public.algorithm_asset_candidate_events
UNION ALL
SELECT
  'learnable_parameter'::text AS asset_surface,
  id::text AS asset_id,
  parameter_key AS asset_key,
  owner_algorithm AS source_module,
  scope_level,
  company_id,
  project_id,
  learning_target,
  learning_maturity,
  publish_anchor,
  automation_maturity,
  learning_maturity AS lifecycle_status,
  'parameter_governance_only'::text AS runtime_effect,
  record_visibility_policy,
  created_at,
  updated_at
FROM public.algorithm_learnable_parameter_registry
UNION ALL
SELECT
  'cold_start_baseline'::text AS asset_surface,
  id::text AS asset_id,
  baseline_key AS asset_key,
  'algorithmAssetColdStartBaselineService'::text AS source_module,
  scope_level,
  company_id,
  project_id,
  learning_target,
  learning_maturity,
  publish_anchor,
  automation_maturity,
  runtime_publication_status AS lifecycle_status,
  'cold_start_shared_baseline_reference_only'::text AS runtime_effect,
  record_visibility_policy,
  created_at,
  updated_at
FROM public.algorithm_cold_start_baselines
UNION ALL
SELECT
  'forecast_residual_overlay'::text AS asset_surface,
  id::text AS asset_id,
  asset_key,
  'algorithmAssetForecastResidualOverlayService'::text AS source_module,
  scope_level,
  company_id,
  project_id,
  learning_target,
  learning_maturity,
  publish_anchor,
  automation_maturity,
  runtime_publication_status AS lifecycle_status,
  'forecast_residual_overlay_only'::text AS runtime_effect,
  record_visibility_policy,
  created_at,
  updated_at
FROM public.duration_forecast_residual_overlays;

ALTER TABLE public.algorithm_asset_candidate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algorithm_asset_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algorithm_asset_replay_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algorithm_asset_replay_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algorithm_learnable_parameter_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algorithm_cold_start_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_forecast_residual_overlays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algorithm_sample_health_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS algorithm_asset_candidate_events_select_admin ON public.algorithm_asset_candidate_events;
CREATE POLICY algorithm_asset_candidate_events_select_admin ON public.algorithm_asset_candidate_events
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.global_role = 'company_admin'));
DROP POLICY IF EXISTS algorithm_asset_candidate_events_write_service_role ON public.algorithm_asset_candidate_events;
CREATE POLICY algorithm_asset_candidate_events_write_service_role ON public.algorithm_asset_candidate_events
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS algorithm_asset_conflicts_select_admin ON public.algorithm_asset_conflicts;
CREATE POLICY algorithm_asset_conflicts_select_admin ON public.algorithm_asset_conflicts
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.global_role = 'company_admin'));
DROP POLICY IF EXISTS algorithm_asset_conflicts_write_service_role ON public.algorithm_asset_conflicts;
CREATE POLICY algorithm_asset_conflicts_write_service_role ON public.algorithm_asset_conflicts
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS algorithm_asset_replay_runs_select_admin ON public.algorithm_asset_replay_runs;
CREATE POLICY algorithm_asset_replay_runs_select_admin ON public.algorithm_asset_replay_runs
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.global_role = 'company_admin'));
DROP POLICY IF EXISTS algorithm_asset_replay_runs_write_service_role ON public.algorithm_asset_replay_runs;
CREATE POLICY algorithm_asset_replay_runs_write_service_role ON public.algorithm_asset_replay_runs
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS algorithm_asset_replay_results_select_admin ON public.algorithm_asset_replay_results;
CREATE POLICY algorithm_asset_replay_results_select_admin ON public.algorithm_asset_replay_results
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.global_role = 'company_admin'));
DROP POLICY IF EXISTS algorithm_asset_replay_results_write_service_role ON public.algorithm_asset_replay_results;
CREATE POLICY algorithm_asset_replay_results_write_service_role ON public.algorithm_asset_replay_results
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS algorithm_learnable_parameter_registry_select_admin ON public.algorithm_learnable_parameter_registry;
CREATE POLICY algorithm_learnable_parameter_registry_select_admin ON public.algorithm_learnable_parameter_registry
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.global_role = 'company_admin'));
DROP POLICY IF EXISTS algorithm_learnable_parameter_registry_write_service_role ON public.algorithm_learnable_parameter_registry;
CREATE POLICY algorithm_learnable_parameter_registry_write_service_role ON public.algorithm_learnable_parameter_registry
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS algorithm_cold_start_baselines_select_admin ON public.algorithm_cold_start_baselines;
CREATE POLICY algorithm_cold_start_baselines_select_admin ON public.algorithm_cold_start_baselines
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.global_role = 'company_admin'));
DROP POLICY IF EXISTS algorithm_cold_start_baselines_write_service_role ON public.algorithm_cold_start_baselines;
CREATE POLICY algorithm_cold_start_baselines_write_service_role ON public.algorithm_cold_start_baselines
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS duration_forecast_residual_overlays_select_admin ON public.duration_forecast_residual_overlays;
CREATE POLICY duration_forecast_residual_overlays_select_admin ON public.duration_forecast_residual_overlays
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.global_role = 'company_admin'));
DROP POLICY IF EXISTS duration_forecast_residual_overlays_write_service_role ON public.duration_forecast_residual_overlays;
CREATE POLICY duration_forecast_residual_overlays_write_service_role ON public.duration_forecast_residual_overlays
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS algorithm_sample_health_events_select_admin ON public.algorithm_sample_health_events;
CREATE POLICY algorithm_sample_health_events_select_admin ON public.algorithm_sample_health_events
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.global_role = 'company_admin'));
DROP POLICY IF EXISTS algorithm_sample_health_events_write_service_role ON public.algorithm_sample_health_events;
CREATE POLICY algorithm_sample_health_events_write_service_role ON public.algorithm_sample_health_events
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON VIEW public.algorithm_asset_registry_view IS
  'v1.4.22.3 backend-admin rule/seed/algorithm asset governance view. Ordinary business pages must not consume this view directly.';

NOTIFY pgrst, 'reload schema';

COMMIT;

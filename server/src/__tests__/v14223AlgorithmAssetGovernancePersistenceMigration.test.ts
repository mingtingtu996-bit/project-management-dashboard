import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = () => readFileSync(
  new URL('../../migrations/193_v14223_algorithm_asset_governance_persistence.sql', import.meta.url),
  'utf8',
)

const incrementalMigration = () => readFileSync(
  new URL('../../migrations/200_v14223_forecast_residual_overlay_runtime_rollback.sql', import.meta.url),
  'utf8',
)

const coldStartIncrementalMigration = () => readFileSync(
  new URL('../../migrations/201_v14223_cold_start_baseline_runtime_rollback.sql', import.meta.url),
  'utf8',
)

const dependencyRuleRuntimeMigration = () => readFileSync(
  new URL('../../migrations/202_v14223_dependency_rule_runtime_publications.sql', import.meta.url),
  'utf8',
)

const wbsTemplateRuntimeMigration = () => readFileSync(
  new URL('../../migrations/203_v14223_wbs_template_runtime_publications.sql', import.meta.url),
  'utf8',
)

const metricRuntimeMigration = () => readFileSync(
  new URL('../../migrations/204_v14223_metric_runtime_publications.sql', import.meta.url),
  'utf8',
)

const defaultMasterPlanRuntimeAssetKindMigration = () => readFileSync(
  new URL('../../migrations/264_v14231_default_master_plan_runtime_publication_asset_kind.sql', import.meta.url),
  'utf8',
)

const wbsTemplateRuntimeBackendRlsMigration = () => readFileSync(
  new URL('../../migrations/279_v14231_wbs_template_runtime_publication_runtime_rls.sql', import.meta.url),
  'utf8',
)

const algorithmAssetCandidateExperienceTierMigration = () => readFileSync(
  new URL('../../migrations/277_v14231_algorithm_asset_candidate_experience_tier.sql', import.meta.url),
  'utf8',
)

const constructionOrganizationPlanNetworkRuntimeMigration = () => readFileSync(
  new URL('../../migrations/231_v14225_construction_organization_plan_network_runtime_publications.sql', import.meta.url),
  'utf8',
)

const t2RhythmTaskWindowAnnotationRuntimeMigration = () => readFileSync(
  new URL('../../migrations/234_v14225_t2_rhythm_task_window_annotation_runtime_publications.sql', import.meta.url),
  'utf8',
)

const t2RhythmScheduleRuntimeMigration = () => readFileSync(
  new URL('../../migrations/241_v14231_t2_rhythm_schedule_runtime_publications.sql', import.meta.url),
  'utf8',
)

const algorithmAssetRegistryViewAclHardeningMigration = () => readFileSync(
  new URL('../../migrations/245_v14231_algorithm_asset_registry_view_acl_hardening.sql', import.meta.url),
  'utf8',
)

describe('v1.4.22.3 algorithm asset governance persistence migration', () => {
  it('creates scoped persistence tables for candidates conflicts replay parameters baselines overlays and sample health', () => {
    const source = migration()

    const requiredTables = [
      'public.algorithm_asset_candidate_events',
      'public.algorithm_asset_conflicts',
      'public.algorithm_asset_replay_runs',
      'public.algorithm_asset_replay_results',
      'public.algorithm_learnable_parameter_registry',
      'public.algorithm_cold_start_baselines',
      'public.duration_forecast_residual_overlays',
      'public.algorithm_sample_health_events',
    ]

    for (const tableName of requiredTables) {
      expect(source).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`)
      expect(source).toContain(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`)
    }

    expect(source).toContain('CREATE OR REPLACE VIEW public.algorithm_asset_registry_view')
    expect(source).not.toContain('security_invoker = true')
    expect(source).not.toContain('REVOKE ALL ON TABLE public.algorithm_asset_registry_view')
    expect(source).toContain("'cold_start_baseline'::text AS asset_surface")
    expect(source).toContain('scope_level TEXT NOT NULL')
    expect(source).toContain('company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE')
    expect(source).toContain('project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE')
    expect(source).toContain('publish_anchor TEXT NOT NULL DEFAULT')
    expect(source).toContain('automation_maturity TEXT NOT NULL DEFAULT')
    expect(source).toContain('learning_maturity TEXT NOT NULL DEFAULT')
    expect(source).toContain('learning_target TEXT NOT NULL DEFAULT')
    expect(source).toContain('record_visibility_policy TEXT NOT NULL DEFAULT')
  })

  it('adds a follow-up migration to harden algorithm_asset_registry_view access', () => {
    const source = algorithmAssetRegistryViewAclHardeningMigration()

    expect(source).toContain('ALTER VIEW public.algorithm_asset_registry_view SET (security_invoker = true, security_barrier = true)')
    expect(source).toContain('REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM PUBLIC')
    expect(source).toContain("FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'workbuddy_runtime'] LOOP")
    expect(source).toContain("EXECUTE format('REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM %I', role_name);")
    expect(source).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('adds first-class experience tier columns for algorithm asset candidates', () => {
    const source = algorithmAssetCandidateExperienceTierMigration()

    expect(source).toContain('ALTER TABLE public.algorithm_asset_candidate_events')
    expect(source).toContain('ADD COLUMN IF NOT EXISTS experience_tier TEXT NULL')
    expect(source).toContain('ADD COLUMN IF NOT EXISTS experience_asset_type TEXT NULL')
    expect(source).toContain('algorithm_asset_candidate_events_experience_tier_check')
    expect(source).toContain("experience_tier IS NULL OR experience_tier IN ('T1', 'T2', 'T3')")
    expect(source).toContain('idx_algorithm_asset_candidate_events_experience_tier')
    expect(source).toContain('idx_algorithm_asset_candidate_events_experience_scope')
    expect(source).toContain("candidate_payload->>'experienceTier'")
    expect(source).toContain("candidate_payload->>'experienceAssetType'")
    expect(source).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('locks v1.4.22.3 safety boundaries into database constraints and indexes', () => {
    const source = migration()

    expect(source).toContain('algorithm_asset_candidate_events_scope_consistency')
    expect(source).toContain('algorithm_asset_candidate_events_no_deleted_range_tree_fields')
    expect(source).toContain('algorithm_asset_conflicts_scope_consistency')
    expect(source).toContain('algorithm_asset_replay_runs_scope_consistency')
    expect(source).toContain('algorithm_asset_replay_results_scope_consistency')
    expect(source).toContain('algorithm_learnable_parameter_registry_scope_consistency')
    expect(source).toContain('algorithm_cold_start_baselines_anonymized_shared_scope')
    expect(source).toContain('duration_forecast_residual_overlays_no_base_seed_mutation')
    expect(source).toContain('runtime_publication_status TEXT NOT NULL DEFAULT')
    expect(source).toContain("CHECK (runtime_publication_status IN ('candidate', 'canary', 'published', 'runtime_rolled_back'))")
    expect(source).toContain('rollback_execution JSONB NULL')
    expect(source).toContain('rolled_back_at TIMESTAMPTZ NULL')
    expect(source).toContain('algorithm_sample_health_events_scope_consistency')

    expect(source).toContain("CHECK (publish_anchor IN ('candidate_only', 'manual_governance_required', 'trusted_source_auto_publish', 'guarded_runtime_auto_publish', 'system_curated_publish'))")
    expect(source).toContain("CHECK (automation_maturity IN ('manual_required', 'auto_review_package', 'auto_shadow', 'auto_canary', 'auto_publish'))")
    expect(source).toContain("CHECK (learning_maturity IN ('frozen_constant', 'shadow_report_only', 'governed_candidate', 'guarded_live_tuning', 'system_curated_learning'))")
    expect(source).toContain("CHECK (learning_target IN ('base_duration', 'forecast_residual', 'context_factor', 'confidence', 'candidate_weight', 'template_structure', 'dependency_order', 'metric_caliber', 'risk_warning', 'governance_report', 'governance_policy'))")

    expect(source).toContain('idx_algorithm_asset_candidate_events_scope')
    expect(source).toContain('idx_algorithm_asset_conflicts_scope')
    expect(source).toContain('idx_algorithm_asset_replay_runs_scope')
    expect(source).toContain('idx_algorithm_asset_replay_results_run')
    expect(source).toContain('idx_algorithm_learnable_parameter_registry_scope')
    expect(source).toContain('idx_algorithm_cold_start_baselines_segment')
    expect(source).toContain('idx_duration_forecast_residual_overlays_scope')
    expect(source).toContain('idx_duration_forecast_residual_overlays_runtime_status')
    expect(source).toContain('idx_algorithm_sample_health_events_scope')
  })

  it('adds an incremental runtime rollback migration for already-applied residual overlay tables', () => {
    const source = incrementalMigration()

    expect(source).toContain('ALTER TABLE public.duration_forecast_residual_overlays')
    expect(source).toContain('ADD COLUMN IF NOT EXISTS runtime_publication_status TEXT NOT NULL DEFAULT')
    expect(source).toContain('ADD COLUMN IF NOT EXISTS rollback_execution JSONB NULL')
    expect(source).toContain('ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMPTZ NULL')
    expect(source).toContain('duration_forecast_residual_overlays_runtime_publication_status_check')
    expect(source).toContain("runtime_publication_status IN ('candidate', 'canary', 'published', 'runtime_rolled_back')")
    expect(source).toContain('CREATE INDEX IF NOT EXISTS idx_duration_forecast_residual_overlays_runtime_status')
    expect(source).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('adds runtime rollback columns for cold-start baseline tables in fresh and already-applied schemas', () => {
    const source = migration()
    const incrementalSource = coldStartIncrementalMigration()

    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.algorithm_cold_start_baselines')
    expect(source).toContain('runtime_publication_status TEXT NOT NULL DEFAULT')
    expect(source).toContain("CHECK (runtime_publication_status IN ('candidate', 'canary', 'published', 'runtime_rolled_back'))")
    expect(source).toContain('rollback_execution JSONB NULL')
    expect(source).toContain('rolled_back_at TIMESTAMPTZ NULL')
    expect(source).toContain('idx_algorithm_cold_start_baselines_runtime_status')

    expect(incrementalSource).toContain('ALTER TABLE public.algorithm_cold_start_baselines')
    expect(incrementalSource).toContain('ADD COLUMN IF NOT EXISTS runtime_publication_status TEXT NOT NULL DEFAULT')
    expect(incrementalSource).toContain('ADD COLUMN IF NOT EXISTS rollback_execution JSONB NULL')
    expect(incrementalSource).toContain('ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMPTZ NULL')
    expect(incrementalSource).toContain('algorithm_cold_start_baselines_runtime_publication_status_check')
    expect(incrementalSource).toContain("runtime_publication_status IN ('candidate', 'canary', 'published', 'runtime_rolled_back')")
    expect(incrementalSource).toContain('CREATE INDEX IF NOT EXISTS idx_algorithm_cold_start_baselines_runtime_status')
    expect(incrementalSource).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('creates dependency rule runtime publication tables without mutating task dependencies or seed runtime', () => {
    const source = dependencyRuleRuntimeMigration()

    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.construction_dependency_rule_runtime_publications')
    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.construction_dependency_rule_runtime_events')
    expect(source).toContain('runtime_publication_status TEXT NOT NULL')
    expect(source).toContain("CHECK (runtime_publication_status IN ('runtime_published', 'runtime_rolled_back'))")
    expect(source).toContain('rollback_execution JSONB NULL')
    expect(source).toContain('rolled_back_at TIMESTAMPTZ NULL')
    expect(source).toContain('dependency_rule_lineage JSONB NOT NULL')
    expect(source).toContain('record_visibility_policy TEXT NOT NULL DEFAULT')
    expect(source).toContain('idx_construction_dependency_rule_runtime_publications_scope')
    expect(source).toContain('idx_construction_dependency_rule_runtime_publications_rollback')
    expect(source).toContain('idx_construction_dependency_rule_runtime_events_source')
    expect(source).toContain('ALTER TABLE public.construction_dependency_rule_runtime_publications ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('ALTER TABLE public.construction_dependency_rule_runtime_events ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('does not write task_dependencies')
    expect(source).toContain('does not write algorithm_seed_records')
    expect(source).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('creates WBS template runtime publication tables without mutating templates tasks baselines or seed runtime', () => {
    const source = wbsTemplateRuntimeMigration()

    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.wbs_template_runtime_publications')
    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.wbs_template_runtime_events')
    expect(source).toContain("asset_kind IN ('special_work_duration_seed', 'wbs_reference_days')")
    expect(source).toContain("CHECK (runtime_publication_status IN ('runtime_published', 'runtime_rolled_back'))")
    expect(source).toContain('company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE')
    expect(source).toContain('project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE')
    expect(source).toContain('rollback_execution JSONB NULL')
    expect(source).toContain('rolled_back_at TIMESTAMPTZ NULL')
    expect(source).toContain('runtime_lineage JSONB NOT NULL')
    expect(source).toContain('record_visibility_policy TEXT NOT NULL DEFAULT')
    expect(source).toContain('idx_wbs_template_runtime_publications_scope')
    expect(source).toContain('idx_wbs_template_runtime_publications_rollback')
    expect(source).toContain('idx_wbs_template_runtime_events_source')
    expect(source).toContain('ALTER TABLE public.wbs_template_runtime_publications ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('ALTER TABLE public.wbs_template_runtime_events ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('does not write wbs_templates')
    expect(source).toContain('does not write task_baselines')
    expect(source).toContain('does not write algorithm_seed_records')
    expect(source).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('extends WBS template runtime publication asset kinds for governed default master-plan publications', () => {
    const source = defaultMasterPlanRuntimeAssetKindMigration()

    expect(source).toContain('ALTER TABLE public.wbs_template_runtime_publications')
    expect(source).toContain('DROP CONSTRAINT IF EXISTS wbs_template_runtime_publications_asset_kind_check')
    expect(source).toContain("asset_kind IN ('special_work_duration_seed', 'wbs_reference_days', 'default_master_plan')")
    expect(source).toContain('default master-plan accepted baseline runtime publication')
    expect(source).toContain('does not write wbs_templates, wbs_template_nodes, tasks, task_baselines, task_dependencies, or algorithm seed runtime')
    expect(source).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('adds backend runtime RLS for WBS template runtime publications without widening template or task writes', () => {
    const source = wbsTemplateRuntimeBackendRlsMigration()

    expect(source).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.wbs_template_runtime_publications TO workbuddy_runtime')
    expect(source).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.wbs_template_runtime_events TO workbuddy_runtime')
    expect(source).toContain('CREATE POLICY wbs_template_runtime_publications_backend_runtime')
    expect(source).toContain('CREATE POLICY wbs_template_runtime_events_backend_runtime')
    expect(source).toContain('TO workbuddy_runtime')
    expect(source).toContain("current_user = 'workbuddy_runtime'")
    expect(source).toContain("pg_has_role(current_user, 'workbuddy_runtime', 'member')")
    expect(source).toContain('default master-plan runtime publications')
    expect(source).toContain('does not grant access to templates, tasks, baselines, task_dependencies, or seed runtime')
    expect(source).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('creates metric runtime publication tables without mutating snapshots project facts or metric values', () => {
    const source = metricRuntimeMigration()

    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.metric_runtime_publications')
    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.metric_runtime_events')
    expect(source).toContain('metric_key TEXT NOT NULL')
    expect(source).toContain('metric_caliber_version_id TEXT NOT NULL')
    expect(source).toContain('company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE')
    expect(source).toContain('project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE')
    expect(source).toContain("CHECK (runtime_publication_status IN ('runtime_published', 'runtime_rolled_back'))")
    expect(source).toContain('metric_lineage JSONB NOT NULL')
    expect(source).toContain('rollback_target TEXT NOT NULL')
    expect(source).toContain('rollback_execution JSONB NULL')
    expect(source).toContain('rolled_back_at TIMESTAMPTZ NULL')
    expect(source).toContain('producer_contract JSONB NOT NULL')
    expect(source).toContain('snapshot_contract JSONB NOT NULL')
    expect(source).toContain('consumer_contracts JSONB NOT NULL')
    expect(source).toContain('record_visibility_policy TEXT NOT NULL DEFAULT')
    expect(source).toContain('idx_metric_runtime_publications_scope')
    expect(source).toContain('idx_metric_runtime_publications_rollback')
    expect(source).toContain('idx_metric_runtime_events_source')
    expect(source).toContain('ALTER TABLE public.metric_runtime_publications ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('ALTER TABLE public.metric_runtime_events ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('does not write metric_value_snapshots')
    expect(source).toContain('does not write project_daily_snapshot')
    expect(source).toContain('does not write projects')
    expect(source).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('creates construction organization plan-network runtime publication tables with dependency-write audit boundaries', () => {
    const source = constructionOrganizationPlanNetworkRuntimeMigration()

    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.construction_organization_plan_network_runtime_publications')
    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.construction_organization_plan_network_runtime_events')
    expect(source).toContain('draft_network_key TEXT NOT NULL')
    expect(source).toContain('release_handoff_candidate_event_id TEXT NOT NULL')
    expect(source).toContain("CHECK (runtime_publication_status IN ('runtime_published', 'runtime_rolled_back'))")
    expect(source).toContain('applied_dependency_edges JSONB NOT NULL')
    expect(source).toContain('release_lineage JSONB NOT NULL')
    expect(source).toContain('rollback_target TEXT NOT NULL')
    expect(source).toContain('rollback_execution JSONB NULL')
    expect(source).toContain('impact_monitoring JSONB NOT NULL DEFAULT')
    expect(source).toContain('idx_construction_org_plan_network_runtime_project')
    expect(source).toContain('idx_construction_org_plan_network_runtime_rollback')
    expect(source).toContain('idx_construction_org_plan_network_runtime_events_source')
    expect(source).toContain('ALTER TABLE public.construction_organization_plan_network_runtime_publications ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('ALTER TABLE public.construction_organization_plan_network_runtime_events ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.construction_organization_plan_network_runtime_publications TO workbuddy_runtime')
    expect(source).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.construction_organization_plan_network_runtime_events TO workbuddy_runtime')
    expect(source).toContain('CREATE POLICY construction_org_plan_network_runtime_publications_backend_runtime')
    expect(source).toContain('CREATE POLICY construction_org_plan_network_runtime_events_backend_runtime')
    expect(source).toContain('TO workbuddy_runtime')
    expect(source).toContain("current_user = 'workbuddy_runtime'")
    expect(source).toContain("pg_has_role(current_user, 'workbuddy_runtime', 'member')")
    expect(source).toContain('source_type=construction_organization_plan_network')
    expect(source).toContain('never writes plan dates, baseline, seed, task facts, acceleration drafts, or critical-path facts')
    expect(source).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('creates T2 rhythm task-window annotation runtime publication tables with metadata-only audit boundaries', () => {
    const source = t2RhythmTaskWindowAnnotationRuntimeMigration()

    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.t2_rhythm_task_window_annotation_runtime_publications')
    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.t2_rhythm_task_window_annotation_runtime_events')
    expect(source).toContain('publication_key TEXT NOT NULL UNIQUE')
    expect(source).toContain('template_id TEXT NOT NULL')
    expect(source).toContain('release_handoff_candidate_event_id TEXT NOT NULL')
    expect(source).toContain('source_candidate_event_id TEXT NOT NULL')
    expect(source).toContain('approval_candidate_event_id TEXT NOT NULL')
    expect(source).toContain("CHECK (runtime_publication_status IN ('runtime_published', 'runtime_rolled_back'))")
    expect(source).toContain('patched_task_count INTEGER NOT NULL DEFAULT 0')
    expect(source).toContain('metadata_patches JSONB NOT NULL DEFAULT')
    expect(source).toContain('release_lineage JSONB NOT NULL DEFAULT')
    expect(source).toContain('rollback_target TEXT NOT NULL')
    expect(source).toContain('rollback_execution JSONB NULL')
    expect(source).toContain('impact_monitoring JSONB NOT NULL DEFAULT')
    expect(source).toContain('idx_t2_rhythm_task_window_annotation_runtime_project')
    expect(source).toContain('idx_t2_rhythm_task_window_annotation_runtime_rollback')
    expect(source).toContain('idx_t2_rhythm_task_window_annotation_runtime_events_source')
    expect(source).toContain('ALTER TABLE public.t2_rhythm_task_window_annotation_runtime_publications ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('ALTER TABLE public.t2_rhythm_task_window_annotation_runtime_events ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.t2_rhythm_task_window_annotation_runtime_publications TO workbuddy_runtime')
    expect(source).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.t2_rhythm_task_window_annotation_runtime_events TO workbuddy_runtime')
    expect(source).toContain('CREATE POLICY t2_rhythm_task_window_annotation_runtime_publications_backend_runtime')
    expect(source).toContain('CREATE POLICY t2_rhythm_task_window_annotation_runtime_events_backend_runtime')
    expect(source).toContain('TO workbuddy_runtime')
    expect(source).toContain("current_user = 'workbuddy_runtime'")
    expect(source).toContain("pg_has_role(current_user, 'workbuddy_runtime', 'member')")
    expect(source).toContain('does not write task_dependencies')
    expect(source).toContain('does not write plan dates, baselines, seeds, critical-path facts, or acceleration drafts')
    expect(source).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('creates T2 rhythm schedule runtime publication tables with governed dependency and plan-date rollback boundaries', () => {
    const source = t2RhythmScheduleRuntimeMigration()

    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.t2_rhythm_schedule_runtime_publications')
    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.t2_rhythm_schedule_runtime_events')
    expect(source).toContain('publication_key TEXT NOT NULL UNIQUE')
    expect(source).toContain('candidate_id TEXT NOT NULL')
    expect(source).toContain('runtime_publication_status TEXT NOT NULL')
    expect(source).toContain("CHECK (runtime_publication_status IN ('runtime_published', 'runtime_rolled_back'))")
    expect(source).toContain('applied_dependency_edges JSONB NOT NULL DEFAULT')
    expect(source).toContain('applied_plan_date_patches JSONB NOT NULL DEFAULT')
    expect(source).toContain('release_lineage JSONB NOT NULL DEFAULT')
    expect(source).toContain('rollback_target TEXT NOT NULL')
    expect(source).toContain('rollback_execution JSONB NULL')
    expect(source).toContain('impact_monitoring JSONB NOT NULL DEFAULT')
    expect(source).toContain("CHECK (event_type IN ('schedule_runtime_apply', 'rollback_execution', 'impact_monitoring'))")
    expect(source).toContain('idx_t2_rhythm_schedule_runtime_project')
    expect(source).toContain('idx_t2_rhythm_schedule_runtime_rollback')
    expect(source).toContain('idx_t2_rhythm_schedule_runtime_events_source')
    expect(source).toContain('ALTER TABLE public.t2_rhythm_schedule_runtime_publications ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('ALTER TABLE public.t2_rhythm_schedule_runtime_events ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.t2_rhythm_schedule_runtime_publications TO workbuddy_runtime')
    expect(source).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.t2_rhythm_schedule_runtime_events TO workbuddy_runtime')
    expect(source).toContain('CREATE POLICY t2_rhythm_schedule_runtime_publications_backend_runtime')
    expect(source).toContain('CREATE POLICY t2_rhythm_schedule_runtime_events_backend_runtime')
    expect(source).toContain('TO workbuddy_runtime')
    expect(source).toContain("current_user = 'workbuddy_runtime'")
    expect(source).toContain("pg_has_role(current_user, 'workbuddy_runtime', 'member')")
    expect(source).toContain('may write T2-owned task_dependencies and patch mapped task planned_start_date/planned_end_date')
    expect(source).toContain('never writes seeds, baselines, critical-path facts, or acceleration drafts')
    expect(source).toContain("NOTIFY pgrst, 'reload schema'")
  })
})

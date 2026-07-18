import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server') ? process.cwd() : resolve(process.cwd(), 'server')
const migrationsRoot = resolve(serverRoot, 'migrations')

function readMigration(name: string) {
  return readFileSync(resolve(migrationsRoot, name), 'utf8')
}

describe('v1.4 canonical clean migration coverage', () => {
  it('keeps the canonical clean bundle current through the latest numbered migration', () => {
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')
    const post279Migrations = readdirSync(migrationsRoot)
      .filter((name) => /^(?:2[89]\d|3\d{2})_.*\.sql$/.test(name))
      .sort((left, right) => left.localeCompare(right, 'en'))
    const latestMigration = post279Migrations.at(-1)
    const latestMigrationNumber = latestMigration?.match(/^(\d+)_/)?.[1]

    expect(latestMigration).toBeDefined()
    expect(latestMigrationNumber).toBeDefined()
    expect(cleanMigration).toContain(
      `CANONICAL: current clean bootstrap bundle, synchronized through migration ${latestMigrationNumber}`,
    )

    let previousSourceIndex = -1
    for (const filename of post279Migrations) {
      const sourceIndex = cleanMigration.indexOf(`Source: ${filename}`)
      expect(sourceIndex, filename).toBeGreaterThan(previousSourceIndex)
      previousSourceIndex = sourceIndex
    }

    const cleanupIndex = cleanMigration.indexOf('Source: 300_runtime_legacy_compatibility_cleanup.sql')
    expect(cleanMigration.trimEnd().endsWith(readMigration(latestMigration!).trim())).toBe(true)
    expect(cleanMigration).toContain('CREATE INDEX idx_tasks_milestone_id')
    expect(cleanMigration).toContain('CREATE INDEX idx_task_baseline_items_source_milestone_id')
    for (const finalCleanup of [
      'DROP TABLE public.task_milestones',
      'DROP TABLE public.milestones',
      'DROP TABLE public.warnings',
      'public.users DROP COLUMN IF EXISTS device_id',
      'public.acceptance_plans DROP COLUMN IF EXISTS responsible_unit',
    ]) {
      expect(cleanMigration.lastIndexOf(finalCleanup), finalCleanup).toBeGreaterThan(cleanupIndex)
    }
  })

  it('keeps CLEAN_MIGRATION_V4 aligned with all v1.4 incremental migrations', () => {
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')
    const v14IncrementalFiles = readdirSync(migrationsRoot)
      .filter((name) => /^(12\d|13\d|14\d|15[0-2])[a-z]?_.*\.sql$/.test(name))
      .sort()

    const missing = v14IncrementalFiles.filter((name) => !cleanMigration.includes(name))

    expect(missing).toEqual([])
  })

  it('keeps late v1.4 integration tables in the canonical clean bundle', () => {
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    for (const requiredAnchor of [
      'warning_lifecycle_status',
      'change_action_types',
      'deletion_retention_events',
      'data_quality_rule_registry',
      'metric_snapshot_version',
      'wbs_template_candidates',
      'duration_experience_samples',
      'task_duration_forecasts',
      'notification_user_states',
      'company_join_requests',
      'project_climate_profiles',
      'algorithm_seed_versions',
      'duration_algorithm_accuracy_events',
      'recommendation_actions',
    ]) {
      expect(cleanMigration).toContain(requiredAnchor)
    }
  })

  it('keeps calendar/weather gap-closure schema fields covered by incremental and clean migrations', () => {
    const incremental = readMigration('161_v1474_calendar_weather_gap_closure.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    for (const requiredAnchor of [
      'soft_soil_level',
      'mountain_terrain',
      'terrain_difficulty_level',
      'seismic_intensity',
      'relative_humidity_percent',
      'snow_depth_cm',
      'seed_versions',
      'site_shutdown_events',
      'uq_site_shutdown_events_project_date_type_source',
    ]) {
      expect(incremental).toContain(requiredAnchor)
      expect(cleanMigration).toContain(requiredAnchor)
    }
  })

  it('keeps duration accuracy event dedupe compatible with runtime upsert', () => {
    const incremental = readMigration('191_v1418_duration_algorithm_accuracy_events.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')
    const upsertCompatibleDedupe = 'ON public.duration_algorithm_accuracy_events(engine_code, dedupe_key);'

    expect(incremental).toContain(upsertCompatibleDedupe)
    expect(cleanMigration).toContain(upsertCompatibleDedupe)
    expect(incremental).not.toContain('WHERE dedupe_key IS NOT NULL')
    expect(cleanMigration).not.toContain('WHERE dedupe_key IS NOT NULL')
  })

  it('keeps duration engine projection fields in the clean bootstrap migration', () => {
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    for (const requiredAnchor of [
      'Source: 182_task_critical_projection_columns_schema_repair.sql',
      'baseline_is_critical BOOLEAN NOT NULL DEFAULT FALSE',
      'total_float_days INTEGER',
      'free_float_days INTEGER',
      'criticality_weight NUMERIC(6,3) NOT NULL DEFAULT 1',
      'idx_tasks_project_criticality_float',
      'Source: 190_add_execution_reference_days.sql',
      'execution_reference_days INT',
      'Source: 194_add_conservative_duration_to_overrides.sql',
      'conservative_duration_days INT',
    ]) {
      expect(cleanMigration).toContain(requiredAnchor)
    }
  })

  it('keeps user recommendation adoption facts in the clean bootstrap migration', () => {
    const incremental = readMigration('214_v14225_recommendation_actions.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    for (const requiredAnchor of [
      'CREATE TABLE IF NOT EXISTS public.recommendation_actions',
      'recommendation_kind TEXT NOT NULL',
      "CHECK (recommendation_kind IN ('schedule_acceleration', 'construction_organization_plan_network'))",
      "CHECK (action_type IN ('adopted', 'declined'))",
      'CONSTRAINT recommendation_actions_unique_action UNIQUE',
      'idx_recommendation_actions_project_kind',
      'ALTER TABLE public.recommendation_actions ENABLE ROW LEVEL SECURITY',
      'recommendation_actions_write_service_role',
    ]) {
      expect(incremental).toContain(requiredAnchor)
      expect(cleanMigration).toContain(requiredAnchor)
    }
  })

  it('keeps late v1.4.23.1 security hardening in the clean bootstrap migration', () => {
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    for (const requiredAnchor of [
      'Source: 215_v14231_drop_execute_sql_rpc.sql',
      'DROP FUNCTION IF EXISTS public.execute_sql(text, jsonb)',
      'DROP FUNCTION IF EXISTS public.execute_sql(text, anyarray)',
      'Source: 216_v14231_lockdown_security_definer_rpcs.sql',
      'REVOKE ALL ON FUNCTION public.replace_task_dependencies(UUID, JSONB) FROM PUBLIC',
      'DROP FUNCTION IF EXISTS public.nextval(TEXT)',
      'Source: 227_v14231_force_core_rls_and_project_policies.sql',
      'CREATE OR REPLACE FUNCTION public.is_active_company_member',
      'ALTER TABLE public.companies FORCE ROW LEVEL SECURITY',
      'ALTER TABLE public.company_members FORCE ROW LEVEL SECURITY',
      'ALTER TABLE public.projects FORCE ROW LEVEL SECURITY',
      'ALTER TABLE public.tasks FORCE ROW LEVEL SECURITY',
      'ALTER TABLE public.task_dependencies FORCE ROW LEVEL SECURITY',
      'ALTER TABLE public.engineering_objects FORCE ROW LEVEL SECURITY',
      'ALTER TABLE public.acceptance_plans FORCE ROW LEVEL SECURITY',
      'ALTER TABLE public.project_daily_snapshot FORCE ROW LEVEL SECURITY',
      'CREATE POLICY projects_read_policy ON public.projects',
      'CREATE POLICY tasks_write_policy ON public.tasks',
      'CREATE POLICY acceptance_plans_write_policy ON public.acceptance_plans',
      'Source: 228_v14231_runtime_database_role.sql',
      'CREATE ROLE workbuddy_runtime NOLOGIN NOBYPASSRLS',
      'GRANT USAGE ON SCHEMA public TO workbuddy_runtime',
      'Source: 229_v14231_runtime_rls_helper_function_acl.sql',
      'GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO workbuddy_runtime',
      'Source: 230_v14231_runtime_users_backend_policy.sql',
      'GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO workbuddy_runtime',
      'CREATE POLICY users_backend_runtime_policy ON public.users',
      'Source: 233_v14231_runtime_login_rls_helper_acl.sql',
      'ALTER ROLE workbuddy_runtime_login WITH INHERIT NOBYPASSRLS',
      'GRANT workbuddy_runtime TO workbuddy_runtime_login',
      'GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO workbuddy_runtime_login',
      'CREATE POLICY companies_backend_runtime_policy ON public.companies',
      'CREATE POLICY project_daily_snapshot_backend_runtime_policy ON public.project_daily_snapshot',
    ]) {
      expect(cleanMigration).toContain(requiredAnchor)
    }
  })

  it('keeps algorithm asset registry view ACL hardening in the clean bootstrap migration', () => {
    const incremental = readMigration('245_v14231_algorithm_asset_registry_view_acl_hardening.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    for (const requiredAnchor of [
      'ALTER VIEW public.algorithm_asset_registry_view SET (security_invoker = true, security_barrier = true)',
      'REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM PUBLIC',
      "FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'workbuddy_runtime'] LOOP",
      "EXECUTE format('REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM %I', role_name);",
      "NOTIFY pgrst, 'reload schema'",
    ]) {
      expect(incremental).toContain(requiredAnchor)
      expect(cleanMigration).toContain(requiredAnchor)
    }

    expect(cleanMigration).toContain('Source: 245_v14231_algorithm_asset_registry_view_acl_hardening.sql')
  })

  it('keeps Advisor public RLS closeout hardening in the clean bootstrap migration', () => {
    const incremental = readMigration('246_v14231_advisor_public_rls_closeout.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    expect(cleanMigration).toContain('Source: 246_v14231_advisor_public_rls_closeout.sql')

    for (const requiredAnchor of [
      'ALTER TABLE IF EXISTS public.project_key_node_snapshots FORCE ROW LEVEL SECURITY',
      'ALTER TABLE IF EXISTS public.task_constraint_snapshots FORCE ROW LEVEL SECURITY',
      'ALTER TABLE IF EXISTS public.data_lineage_entity_types FORCE ROW LEVEL SECURITY',
      'ALTER TABLE IF EXISTS public.data_lineage_relation_rules FORCE ROW LEVEL SECURITY',
      'project_key_node_snapshots_auth_read_policy',
      'project_key_node_snapshots_auth_write_policy',
      'project_key_node_snapshots_backend_runtime_policy',
      'task_constraint_snapshots_auth_read_policy',
      'task_constraint_snapshots_auth_write_policy',
      'task_constraint_snapshots_backend_runtime_policy',
      'data_lineage_entity_types_authenticated_read_policy',
      'data_lineage_entity_types_backend_runtime_read_policy',
      'data_lineage_relation_rules_authenticated_read_policy',
      'data_lineage_relation_rules_backend_runtime_read_policy',
      "public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])",
      "NOTIFY pgrst, 'reload schema'",
    ]) {
      expect(incremental).toContain(requiredAnchor)
      expect(cleanMigration).toContain(requiredAnchor)
    }
  })

  it('keeps late v1.4.23.1 runtime publication and experience-tier migrations in the clean bootstrap migration', () => {
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    for (const requiredAnchor of [
      'Source: 264_v14231_default_master_plan_runtime_publication_asset_kind.sql',
      'wbs_template_runtime_publications_asset_kind_check',
      'default_master_plan',
      'Source: 279_v14231_wbs_template_runtime_publication_runtime_rls.sql',
      'GRANT SELECT, INSERT, UPDATE ON TABLE public.wbs_template_runtime_publications TO workbuddy_runtime',
      'GRANT SELECT, INSERT, UPDATE ON TABLE public.wbs_template_runtime_events TO workbuddy_runtime',
      'CREATE POLICY wbs_template_runtime_publications_backend_runtime',
      'CREATE POLICY wbs_template_runtime_events_backend_runtime',
      'Source: 277_v14231_algorithm_asset_candidate_experience_tier.sql',
      'experience_tier TEXT NULL',
      'experience_asset_type TEXT NULL',
      'algorithm_asset_candidate_events_experience_tier_check',
      'idx_algorithm_asset_candidate_events_experience_tier',
      'idx_algorithm_asset_candidate_events_experience_scope',
    ]) {
      expect(cleanMigration).toContain(requiredAnchor)
    }
  })

  it('keeps global data lineage reference reads behind an explicit auth predicate', () => {
    const incremental = readMigration('249_v14231_data_lineage_global_reference_auth_predicate.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    for (const requiredAnchor of [
      'data_lineage_entity_types_authenticated_read_policy',
      'data_lineage_relation_rules_authenticated_read_policy',
      'USING (auth.uid() IS NOT NULL)',
      "NOTIFY pgrst, 'reload schema'",
    ]) {
      expect(incremental).toContain(requiredAnchor)
      expect(cleanMigration).toContain(requiredAnchor)
    }

    expect(incremental).not.toContain('USING (true)')
  })

  it('keeps late runtime write-chain cleanup in the clean bootstrap migration', () => {
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    for (const requiredAnchor of [
      'Source: 052_add_task_timeline_events.sql',
      'CREATE TABLE IF NOT EXISTS task_timeline_events',
      'CREATE OR REPLACE FUNCTION sync_task_timeline_for_task()',
      'Source: 235_v14231_task_code_runtime_rls_policies.sql',
      'GRANT SELECT, INSERT, UPDATE ON TABLE public.project_task_code_rules TO workbuddy_runtime',
      'CREATE POLICY task_code_history_backend_runtime_policy ON public.task_code_history',
      'Source: 236_v14231_task_creation_side_effect_runtime_rls_policies.sql',
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_timeline_events TO workbuddy_runtime',
      'CREATE POLICY operation_logs_backend_runtime_policy ON public.operation_logs',
      'Source: 237_v14231_data_lineage_runtime_rls_policies.sql',
      'GRANT SELECT ON TABLE public.data_lineage_entity_types TO workbuddy_runtime',
      'CREATE POLICY data_lineage_batches_backend_runtime_policy ON public.data_lineage_batches',
      'Source: 238_v14231_data_lineage_event_cleanup_fk.sql',
      'ON DELETE CASCADE',
      'Source: 239_v14231_data_lineage_event_cleanup_trigger.sql',
      'CREATE OR REPLACE FUNCTION public.check_lineage_events_append_only()',
      'BEFORE UPDATE ON public.data_lineage_events',
      'Source: 240_v14231_task_condition_delete_timeline_cleanup_guard.sql',
      'CREATE OR REPLACE FUNCTION public.sync_task_timeline_for_condition()',
      'CREATE TRIGGER trigger_task_timeline_conditions',
    ]) {
      expect(cleanMigration).toContain(requiredAnchor)
    }
  })

  it('keeps backend-runtime candidate-only algorithm asset event policy in the clean bootstrap migration', () => {
    const incremental = readMigration('242_v14231_algorithm_asset_candidate_events_runtime_candidate_policy.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    expect(cleanMigration).toContain('Source: 242_v14231_algorithm_asset_candidate_events_runtime_candidate_policy.sql')

    for (const requiredAnchor of [
      'algorithm_asset_candidate_events_backend_runtime_select',
      'algorithm_asset_candidate_events_backend_runtime_candidate_write',
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_asset_candidate_events TO workbuddy_runtime',
      "event_status IN ('observed', 'candidate', 'replay_ready', 'review_required', 'quarantined', 'rejected', 'superseded')",
      "publish_anchor IN ('candidate_only', 'manual_governance_required')",
      "learning_maturity IN ('shadow_report_only', 'governed_candidate')",
      "runtime_effect NOT IN ('guarded_runtime_auto_publish', 'system_curated_publish', 'runtime_published')",
    ]) {
      expect(incremental).toContain(requiredAnchor)
      expect(cleanMigration).toContain(requiredAnchor)
    }

    expect(cleanMigration).toContain("to_regclass('public.algorithm_asset_candidate_events') IS NOT NULL")
  })
})

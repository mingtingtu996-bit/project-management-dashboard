import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const migrationsRoot = resolve(serverRoot, 'migrations')

function readMigration(name: string) {
  return readFileSync(resolve(migrationsRoot, name), 'utf8')
}

const rlsNoPolicyTables = [
  'acceptance_catalog',
  'acceptance_dependencies',
  'acceptance_nodes',
  'acceptance_requirements',
  'alerts',
  'certificate_approvals',
  'certificate_dependencies',
  'certificate_work_items',
  'change_logs',
  'construction_drawings',
  'data_confidence_snapshots',
  'data_quality_findings',
  'drawing_package_items',
  'drawing_packages',
  'drawing_review_rules',
  'drawing_versions',
  'duration_plan_network_outcomes',
  'issues',
  'job_execution_logs',
  'job_failures',
  'milestones',
  'participant_units',
  'planning_draft_locks',
  'planning_governance_states',
  'pre_milestone_conditions',
  'pre_milestone_dependencies',
  'pre_milestones',
  'project_data_quality_settings',
  'project_invitations',
  'project_materials',
  'project_members',
  'responsibility_alert_states',
  'responsibility_watchlist',
  'revision_pool_candidates',
  'risks',
  'schema_migrations',
  'standard_processes',
  'task_completion_reports',
  'task_critical_overrides',
  'task_locks',
  'task_milestones',
  'task_preceding_relations',
  'task_progress_snapshots',
  'trigger_execution_logs',
  'warning_acknowledgments',
  'warnings',
  'wbs_structure',
  'wbs_task_links',
  'wbs_template_nodes',
  'wbs_templates',
  'weekly_digests',
]

const mutableSearchPathFunctions = [
  'auto_complete_conditions',
  'auto_record_progress_snapshot',
  'auto_resolve_obstacles_on_task_complete',
  'check_lineage_events_append_only',
  'check_task_dependencies_same_project',
  'check_task_milestone_reference',
  'cleanup_milestone_references_on_cancel',
  'cleanup_old_job_logs',
  'confirm_warning_as_risk_atomic',
  'create_certificate_work_item_atomic',
  'create_issue_from_risk_atomic',
  'deactivate_target_project_entity_links_before_delete',
  'delete_risk_with_source_backfill_atomic',
  'delete_task_condition_with_source_backfill_atomic',
  'delete_task_obstacle_with_source_backfill_atomic',
  'delete_task_with_source_backfill_atomic',
  'fill_notification_company_id',
  'fn_update_pre_milestone_status',
  'has_project_edit_permission',
  'is_project_owner',
  'mark_source_deleted_on_downstream_atomic',
  'prevent_delete_active_project_entity_links',
  'protect_upgrade_chain_issue_delete',
  'protect_upgrade_chain_risk_delete',
  'record_task_timeline_event',
  'safe_generate_completion_report',
  'set_duration_forecast_residual_overlay_publication_key',
  'set_notification_company_id',
  'set_updated_at',
  'set_wbs_template_company_id',
  'sync_task_condition_status',
  'sync_task_timeline_for_condition',
  'sync_task_timeline_for_obstacle',
  'sync_task_timeline_for_task',
  'update_certificate_approvals_timestamp',
  'update_certificate_work_items_timestamp',
  'update_construction_drawings_updated_at',
  'update_drawing_package_items_updated_at',
  'update_drawing_packages_updated_at',
  'update_drawing_review_rules_updated_at',
  'update_drawing_versions_updated_at',
  'update_engineering_categories_updated_at',
  'update_engineering_objects_updated_at',
  'update_issues_updated_at',
  'update_project_daily_snapshot_updated_at',
  'update_project_entity_links_updated_at',
  'update_risk_statistics_updated_at',
  'update_task_conditions_updated_at',
  'update_task_dependencies_updated_at',
  'update_task_obstacles_updated_at',
  'update_task_progress_on_condition_complete',
  'update_updated_at_column',
  'update_warnings_updated_at',
]

describe('Supabase Advisor security closeout migration', () => {
  it('adds backend runtime policies to all Advisor RLS-enabled tables that had no policies', () => {
    const migration = readMigration('259_v14231_supabase_advisor_security_closeout.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    expect(cleanMigration).toContain('Source: 259_v14231_supabase_advisor_security_closeout.sql')

    for (const table of rlsNoPolicyTables) {
      expect(migration).toContain(`'${table}'`)
      expect(cleanMigration).toContain(`'${table}'`)
    }

    for (const sql of [migration, cleanMigration]) {
      expect(sql).toContain("table_name || '_backend_runtime_policy'")
      expect(sql).toContain('TO workbuddy_runtime')
      expect(sql).toContain("pg_has_role(current_user, 'workbuddy_runtime', 'member')")
      expect(sql).not.toContain('CREATE POLICY health_history_insert')
      expect(sql).not.toContain('CREATE POLICY health_history_update')
    }
  })

  it('replaces project_health_history always-true write policies with scoped read and backend runtime writes', () => {
    const migration = readMigration('259_v14231_supabase_advisor_security_closeout.sql')

    expect(migration).toContain('DROP POLICY IF EXISTS health_history_insert ON public.project_health_history')
    expect(migration).toContain('DROP POLICY IF EXISTS health_history_update ON public.project_health_history')
    expect(migration).toContain('project_health_history_auth_project_member_read_policy')
    expect(migration).toContain('public.is_active_project_member(project_health_history.project_id, NULL::TEXT[])')
    expect(migration).toContain('project_health_history_backend_runtime_policy')
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON TABLE public.project_health_history FROM authenticated')
  })

  it('sets fixed search_path on all Advisor-flagged public functions', () => {
    const migration = readMigration('259_v14231_supabase_advisor_security_closeout.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    for (const functionName of mutableSearchPathFunctions) {
      expect(migration).toContain(`'${functionName}'`)
      expect(cleanMigration).toContain(`'${functionName}'`)
    }

    expect(migration).toContain('ALTER FUNCTION %s SET search_path = public, pg_temp')
  })

  it('moves ltree out of public in incremental and clean migrations', () => {
    const migration = readMigration('259_v14231_supabase_advisor_security_closeout.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    expect(migration).toContain('CREATE SCHEMA IF NOT EXISTS extensions')
    expect(migration).toContain('ALTER EXTENSION ltree SET SCHEMA extensions')
    expect(cleanMigration).toContain('CREATE EXTENSION IF NOT EXISTS ltree WITH SCHEMA extensions')
    expect(cleanMigration).toContain('wbs_path extensions.LTREE NOT NULL')
  })

  it('keeps migration governance scripts requiring the Advisor security closeout readback', () => {
    const evidenceScript = readFileSync(
      resolve(serverRoot, 'src/scripts/generate-production-migration-governance-evidence.ts'),
      'utf8',
    )
    const governanceService = readFileSync(
      resolve(serverRoot, 'src/services/migrationProductionGovernanceService.ts'),
      'utf8',
    )

    for (const source of [evidenceScript, governanceService]) {
      expect(source).toContain('259_v14231_supabase_advisor_security_closeout.sql')
    }

    expect(evidenceScript).toContain('readSupabaseAdvisorSecurityCloseoutReadback')
    expect(evidenceScript).toContain('readBackendRuntimeRlsReadback')
    expect(evidenceScript).toContain("p.polname = c.relname || '_backend_runtime_policy'")
    expect(evidenceScript).toContain("extensionNamespace !== 'public'")
    expect(evidenceScript).toContain("p.polname IN ('health_history_insert', 'health_history_update')")
  })

  it('evaluates the final catalog after the 304 WBS legacy retirement', () => {
    const evidenceScript = readFileSync(
      resolve(serverRoot, 'src/scripts/generate-production-migration-governance-evidence.ts'),
      'utf8',
    )
    const readbackStart = evidenceScript.indexOf(
      'async function readSupabaseAdvisorSecurityCloseoutReadback',
    )
    const readbackEnd = evidenceScript.indexOf(
      'async function readDefaultMasterPlanRuntimePublicationAssetKindReadback',
      readbackStart,
    )
    const currentCatalogReadback = evidenceScript.slice(readbackStart, readbackEnd)
    const retirement = readMigration('304_v1420_viewer_wbs_legacy_closeout.sql')

    expect(retirement).toContain('DROP TABLE IF EXISTS public.wbs_task_links')
    expect(retirement).toContain('DROP TABLE IF EXISTS public.wbs_structure')
    expect(currentCatalogReadback).not.toContain("'wbs_task_links'")
    expect(currentCatalogReadback).not.toContain("'wbs_structure'")
  })

  it('evaluates the final registry ACL after the 298 backend read grant', () => {
    const evidenceScript = readFileSync(
      resolve(serverRoot, 'src/scripts/generate-production-migration-governance-evidence.ts'),
      'utf8',
    )
    const readbackStart = evidenceScript.indexOf(
      'async function readAlgorithmAssetRegistryViewReadback',
    )
    const readbackEnd = evidenceScript.indexOf(
      'async function readAdvisorPublicRlsReadback',
      readbackStart,
    )
    const currentAclReadback = evidenceScript.slice(readbackStart, readbackEnd)
    const reconciliation = readMigration('298_extended_schema_drift_reconciliation.sql')

    expect(reconciliation).toContain(
      'GRANT SELECT ON TABLE public.algorithm_asset_registry_view TO service_role',
    )
    expect(reconciliation).toContain(
      'GRANT SELECT ON TABLE public.algorithm_asset_registry_view TO workbuddy_runtime',
    )
    expect(currentAclReadback).toContain('row.service_role_select === true')
    expect(currentAclReadback).toContain('row.runtime_select === true')
    expect(currentAclReadback).toContain('row.public_select !== true')
    expect(currentAclReadback).toContain('row.anon_select !== true')
    expect(currentAclReadback).toContain('row.authenticated_select !== true')
  })
})

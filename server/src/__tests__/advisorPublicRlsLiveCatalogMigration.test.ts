import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('\\server') ? process.cwd() : resolve(process.cwd(), 'server')
const migrationsRoot = resolve(serverRoot, 'migrations')

function readMigration(name: string) {
  return readFileSync(resolve(migrationsRoot, name), 'utf8')
}

const liveAdvisorRlsDisabledTables = [
  'algorithm_caliber_versions',
  'algorithm_catalog',
  'algorithm_seed_catalog',
  'algorithm_seed_import_logs',
  'algorithm_seed_overrides',
  'algorithm_seed_quality_events',
  'algorithm_seed_records',
  'algorithm_seed_upgrade_candidates',
  'algorithm_seed_versions',
  'certificate_template_apply_batches',
  'company_project_templates',
  'deletion_retention_events',
  'demo_projects',
  'duration_algorithm_accuracy_events',
  'duration_benchmarks',
  'duration_forecast_project_overlays',
  'duration_suggestion_overrides',
  'material_arrival_to_condition',
  'metric_caliber_versions',
  'project_climate_profiles',
  'project_location_observations',
  'project_schedule_states',
  'project_weather_forecasts',
  'regional_climate_rules',
  'site_shutdown_events',
  'task_duration_forecasts',
  'task_reconcile_backups',
  'warning_coverage_snapshots',
  'warning_owner_confirmations',
  'warning_policy_configs',
  'warning_threshold_candidates',
]

describe('live Supabase Advisor public RLS catalog closeout migration', () => {
  it('hardens all 31 live catalog RLS-disabled tables in incremental and clean migrations', () => {
    const incremental = readMigration('253_v14231_advisor_public_rls_live_catalog_closeout.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    expect(cleanMigration).toContain('Source: 253_v14231_advisor_public_rls_live_catalog_closeout.sql')

    for (const table of liveAdvisorRlsDisabledTables) {
      for (const sql of [incremental, cleanMigration]) {
        expect(sql).toContain(`ALTER TABLE IF EXISTS public.${table} ENABLE ROW LEVEL SECURITY`)
        expect(sql).toContain(`ALTER TABLE IF EXISTS public.${table} FORCE ROW LEVEL SECURITY`)
        expect(sql).toContain(`CREATE POLICY ${table}_`)
      }
    }

    for (const table of [
      'algorithm_catalog',
      'algorithm_seed_records',
      'algorithm_seed_versions',
      'demo_projects',
      'regional_climate_rules',
    ]) {
      expect(incremental).toContain(`CREATE POLICY ${table}_authenticated_read_policy`)
      expect(incremental).toContain(`GRANT SELECT ON TABLE public.${table} TO authenticated`)
    }

    for (const table of [
      'task_duration_forecasts',
      'project_schedule_states',
      'project_weather_forecasts',
      'warning_threshold_candidates',
      'material_arrival_to_condition',
    ]) {
      expect(incremental).toContain(`CREATE POLICY ${table}_auth_project_member_read_policy`)
      expect(incremental).toContain(`public.is_active_project_member(${table}.project_id, NULL::TEXT[])`)
    }

    for (const table of liveAdvisorRlsDisabledTables) {
      expect(incremental).toContain(`CREATE POLICY ${table}_backend_runtime_policy`)
    }

    expect(incremental).toContain("pg_has_role(current_user, 'workbuddy_runtime', 'member')")
    expect(incremental).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('keeps the new live Advisor surface in production governance readback and docs', () => {
    const workspaceRoot = resolve(serverRoot, '..')
    const evidenceScript = readFileSync(
      resolve(serverRoot, 'src/scripts/generate-production-migration-governance-evidence.ts'),
      'utf8',
    )
    const governanceService = readFileSync(
      resolve(serverRoot, 'src/services/migrationProductionGovernanceService.ts'),
      'utf8',
    )
    const mainPlan = readFileSync(
      resolve(workspaceRoot, 'docs/plans/v1.4.23.1体系收口台账与验收门禁矩阵.md'),
      'utf8',
    )
    const ledgerPlan = readFileSync(
      resolve(workspaceRoot, 'docs/plans/v1.4.23.1-A体系收口台账与验收门禁矩阵.md'),
      'utf8',
    )

    expect(evidenceScript).toContain('253_v14231_advisor_public_rls_live_catalog_closeout.sql')
    expect(evidenceScript).toContain('readAdvisorLiveCatalogPublicRlsReadback')
    expect(governanceService).toContain('253_v14231_advisor_public_rls_live_catalog_closeout.sql')

    for (const plan of [mainPlan, ledgerPlan]) {
      expect(plan).toContain('253_v14231_advisor_public_rls_live_catalog_closeout.sql')
      expect(plan).toContain('31 张 live catalog `relrowsecurity=false` 表')
      expect(plan).toContain('不是 Supabase Advisor 缓存')
    }
  })
})

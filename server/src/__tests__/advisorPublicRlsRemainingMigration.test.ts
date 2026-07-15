import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server') ? process.cwd() : resolve(process.cwd(), 'server')
const migrationsRoot = resolve(serverRoot, 'migrations')

function readMigration(name: string) {
  return readFileSync(resolve(migrationsRoot, name), 'utf8')
}

const remainingAdvisorTables = [
  'data_quality_rule_registry',
  'change_action_types',
  'governance_approval_records',
  'metric_value_snapshots',
  'wbs_template_candidate_events',
  'reminder_preferences',
  'reminder_dismissals',
  'duration_experience_samples',
  'wbs_template_candidate_aggregations',
  'duration_forecast_model_profiles',
  'permission_roles',
  'company_invitations',
  'project_direct_invitations',
  'project_join_requests',
  'company_join_requests',
  'notification_user_states',
]

describe('remaining Supabase Advisor public RLS closeout migration', () => {
  it('hardens the remaining Advisor-visible public tables in incremental and clean migrations', () => {
    const incremental = readMigration('252_v14231_advisor_public_rls_remaining_closeout.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    expect(cleanMigration).toContain('Source: 252_v14231_advisor_public_rls_remaining_closeout.sql')

    for (const table of remainingAdvisorTables) {
      for (const sql of [incremental, cleanMigration]) {
        expect(sql).toContain(`ALTER TABLE IF EXISTS public.${table} ENABLE ROW LEVEL SECURITY`)
        expect(sql).toContain(`ALTER TABLE IF EXISTS public.${table} FORCE ROW LEVEL SECURITY`)
        expect(sql).toContain(`CREATE POLICY ${table}_`)
      }
    }

    for (const table of [
      'data_quality_rule_registry',
      'change_action_types',
      'duration_forecast_model_profiles',
      'permission_roles',
    ]) {
      expect(incremental).toContain(`CREATE POLICY ${table}_authenticated_read_policy`)
      expect(incremental).toContain(`GRANT SELECT ON TABLE public.${table} TO authenticated`)
      expect(incremental).toContain(`CREATE POLICY ${table}_backend_runtime_read_policy`)
    }

    for (const table of ['reminder_preferences', 'reminder_dismissals', 'notification_user_states']) {
      expect(incremental).toContain(`CREATE POLICY ${table}_auth_self_policy`)
      expect(incremental).toContain(`${table}.user_id = auth.uid()`)
      expect(incremental).toContain(`CREATE POLICY ${table}_backend_runtime_policy`)
    }

    for (const table of [
      'governance_approval_records',
      'metric_value_snapshots',
      'wbs_template_candidate_events',
      'wbs_template_candidate_aggregations',
      'duration_experience_samples',
    ]) {
      expect(incremental).toContain(`CREATE POLICY ${table}_auth_read_policy`)
      expect(incremental).toContain(`CREATE POLICY ${table}_backend_runtime_policy`)
    }

    for (const table of [
      'company_invitations',
      'project_direct_invitations',
      'project_join_requests',
      'company_join_requests',
    ]) {
      expect(incremental).toContain(`CREATE POLICY ${table}_auth_read_policy`)
      expect(incremental).toContain(`CREATE POLICY ${table}_auth_write_policy`)
      expect(incremental).toContain(`CREATE POLICY ${table}_backend_runtime_policy`)
    }

    expect(incremental).toContain('public.is_active_company_member')
    expect(incremental).toContain('GRANT EXECUTE ON FUNCTION public.is_active_project_member(UUID, TEXT[]) TO workbuddy_runtime')
    expect(incremental).toContain('GRANT EXECUTE ON FUNCTION public.is_active_project_member(UUID, TEXT[]) TO workbuddy_runtime_login')
    expect(cleanMigration).toContain('GRANT EXECUTE ON FUNCTION public.is_active_project_member(UUID, TEXT[]) TO workbuddy_runtime_login')
    expect(incremental).toContain("pg_has_role(current_user, 'workbuddy_runtime', 'member')")
    expect(incremental).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('keeps policy column dependencies covered by earlier migrations or defensive DDL', () => {
    const incremental = readMigration('252_v14231_advisor_public_rls_remaining_closeout.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    expect(cleanMigration).toContain('ADD COLUMN IF NOT EXISTS owner_id UUID')
    expect(cleanMigration).toContain('ADD CONSTRAINT projects_owner_id_fkey')
    expect(cleanMigration).toContain('FOREIGN KEY (owner_id) REFERENCES public.users(id)')
    expect(cleanMigration).toContain('CREATE TABLE IF NOT EXISTS project_direct_invitations')
    expect(cleanMigration).toContain('recipient_user_id UUID REFERENCES users(id)')
    expect(cleanMigration).toContain('reviewed_by UUID REFERENCES users(id)')
    expect(cleanMigration).toContain('ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES companies(id)')
    expect(cleanMigration).toContain('CREATE TABLE IF NOT EXISTS governance_approval_records')
    expect(cleanMigration).toContain('requested_by UUID REFERENCES users(id)')
    expect(cleanMigration).toContain('approved_by UUID REFERENCES users(id)')
    expect(cleanMigration).toContain('rejected_by UUID REFERENCES users(id)')
    expect(cleanMigration).toContain('CREATE TABLE IF NOT EXISTS wbs_template_candidate_events')
    expect(cleanMigration).toContain('created_by UUID')
    expect(cleanMigration).toContain('CREATE TABLE IF NOT EXISTS duration_experience_samples')

    expect(incremental).toContain('ADD COLUMN IF NOT EXISTS learning_scope TEXT NOT NULL DEFAULT')
    expect(incremental).toContain('ADD COLUMN IF NOT EXISTS learning_scope_source TEXT NOT NULL DEFAULT')
    expect(incremental).toContain('project_direct_invitations.company_id')
    expect(incremental).toContain('project_join_requests.company_id')
    expect(incremental).toContain('company_join_requests.company_id')
    expect(incremental).toContain('recipient_user_id = auth.uid()')
    expect(incremental).toContain('reviewed_by = auth.uid()')
    expect(incremental).toContain('requested_by = auth.uid()')
    expect(incremental).toContain('approved_by = auth.uid()')
    expect(incremental).toContain('rejected_by = auth.uid()')
    expect(incremental).toContain('created_by = auth.uid()')
  })

  it('documents the Advisor catalog and staging rescan boundary without claiming production closeout', () => {
    const workspaceRoot = resolve(serverRoot, '..')
    const mainPlan = readFileSync(
      resolve(workspaceRoot, 'docs/plans/v1.4.23.1体系收口台账与验收门禁矩阵.md'),
      'utf8',
    )
    const ledgerPlan = readFileSync(
      resolve(workspaceRoot, 'docs/plans/v1.4.23.1-A体系收口台账与验收门禁矩阵.md'),
      'utf8',
    )

    for (const plan of [mainPlan, ledgerPlan]) {
      expect(plan).toContain('252_v14231_advisor_public_rls_remaining_closeout.sql')
      expect(plan).toContain('新增 Advisor/public catalog')
      expect(plan).toContain('production-readback.json')
      expect(plan).toContain('253_v14231_advisor_public_rls_live_catalog_closeout.sql')
      expect(plan).toContain('259_v14231_supabase_advisor_security_closeout.sql')
      expect(plan).toContain('securityIssueCount=0')
      expect(plan).toContain('不表示 production 已完成同轮发布验收')
      expect(plan).toContain('不表示 performance Advisor')
    }
  })
})

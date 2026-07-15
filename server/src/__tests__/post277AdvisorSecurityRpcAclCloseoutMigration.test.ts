import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('\\server') || process.cwd().endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const migrationsRoot = resolve(serverRoot, 'migrations')

function readMigration(name: string) {
  return readFileSync(resolve(migrationsRoot, name), 'utf8')
}

const advisorFlaggedPublicHelpers = [
  'has_project_edit_permission',
  'is_active_company_member',
  'is_active_project_member',
  'is_project_member',
  'is_project_owner',
]

describe('post-277 Supabase Advisor security RPC ACL closeout migration', () => {
  it('ships as an incremental and clean-bundle migration', () => {
    const migration = readMigration('278_v14231_post277_advisor_security_rpc_acl_closeout.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    expect(cleanMigration).toContain('Source: 278_v14231_post277_advisor_security_rpc_acl_closeout.sql')
    expect(cleanMigration).toContain(migration.trim().slice(0, 120))
  })

  it('moves RLS helper execution to a non-exposed private schema before revoking public RPC grants', () => {
    const migration = readMigration('278_v14231_post277_advisor_security_rpc_acl_closeout.sql')

    expect(migration).toContain('CREATE SCHEMA IF NOT EXISTS workbuddy_private')
    expect(migration).toContain('REVOKE ALL ON SCHEMA workbuddy_private FROM PUBLIC')

    for (const helper of advisorFlaggedPublicHelpers) {
      expect(migration).toContain(`CREATE OR REPLACE FUNCTION workbuddy_private.${helper}`)
      expect(migration).toContain(`REVOKE ALL ON FUNCTION workbuddy_private.${helper}`)
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION workbuddy_private.${helper}`)
    }

    expect(migration).toContain('GRANT USAGE ON SCHEMA workbuddy_private TO %I')
    expect(migration).toContain('workbuddy_private.is_active_company_member')
    expect(migration).toContain('workbuddy_private.is_active_project_member')
    expect(migration).toContain('workbuddy_private.is_project_member')
    expect(migration).toContain('workbuddy_private.is_project_owner')
    expect(migration).toContain('workbuddy_private.has_project_edit_permission')
  })

  it('revokes Advisor-flagged public SECURITY DEFINER RPC execution from API roles', () => {
    const migration = readMigration('278_v14231_post277_advisor_security_rpc_acl_closeout.sql')

    for (const signature of [
      'public.has_project_edit_permission(uuid, uuid)',
      'public.is_active_company_member(uuid, text[])',
      'public.is_active_project_member(uuid, text[])',
      'public.is_project_member(uuid, uuid)',
      'public.is_project_owner(uuid, uuid)',
    ]) {
      expect(migration).toContain(`'${signature}'`)
    }

    expect(migration).toContain("FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']")
    expect(migration).toContain('REVOKE ALL ON FUNCTION %s FROM %I')
    expect(migration).toContain("FOREACH role_name IN ARRAY ARRAY['service_role', 'workbuddy_runtime', 'workbuddy_runtime_login']")
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION %s TO %I')
  })

  it('rewrites existing RLS policies away from public helper references', () => {
    const migration = readMigration('278_v14231_post277_advisor_security_rpc_acl_closeout.sql')

    expect(migration).toContain('FROM pg_policy p')
    expect(migration).toContain('DROP POLICY IF EXISTS %I ON %I.%I')
    expect(migration).toContain('CREATE POLICY %I ON %I.%I')
    expect(migration).toContain("regexp_replace(using_expr, 'public\\.is_active_company_member\\s*\\('")
    expect(migration).toContain("regexp_replace(check_expr, 'public\\.is_project_member\\s*\\('")
    expect(migration).toContain("regexp_replace(using_expr, '(^|[^.[:alnum:]_])has_project_edit_permission\\s*\\('")
  })

  it('removes the legacy dashboard materialized view from anon/authenticated API visibility', () => {
    const migration = readMigration('278_v14231_post277_advisor_security_rpc_acl_closeout.sql')

    expect(migration).toContain("to_regclass('public.mv_project_dashboard') IS NOT NULL")
    expect(migration).toContain('REVOKE ALL ON TABLE public.mv_project_dashboard FROM PUBLIC')
    expect(migration).toContain("FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']")
    expect(migration).toContain('REVOKE ALL ON TABLE public.mv_project_dashboard FROM %I')
  })

  it('keeps production migration governance requiring post-277 Advisor ACL readback', () => {
    const evidenceScript = readFileSync(
      resolve(serverRoot, 'src/scripts/generate-production-migration-governance-evidence.ts'),
      'utf8',
    )
    const governanceService = readFileSync(
      resolve(serverRoot, 'src/services/migrationProductionGovernanceService.ts'),
      'utf8',
    )

    for (const source of [evidenceScript, governanceService]) {
      expect(source).toContain('278_v14231_post277_advisor_security_rpc_acl_closeout.sql')
    }

    expect(evidenceScript).toContain('readPost277AdvisorSecurityRpcAclCloseoutReadback')
    expect(evidenceScript).toContain('has_function_privilege')
    expect(evidenceScript).toContain('public_helper_policy_count')
    expect(evidenceScript).toContain('mv_project_dashboard')
  })
})

import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

describe('runtime Supabase PostgREST role migration', () => {
  it('lets only the PostgREST authenticator assume the backend runtime role', () => {
    const forward = readFileSync(resolve(
      workspaceRoot,
      'server/migrations/336_runtime_postgrest_role_boundary.sql',
    ), 'utf8')

    expect(forward).toMatch(/pg_roles[\s\S]+rolname\s*=\s*'workbuddy_runtime'/i)
    expect(forward).toMatch(/pg_roles[\s\S]+rolname\s*=\s*'authenticator'/i)
    expect(forward).toMatch(/GRANT\s+workbuddy_runtime\s+TO\s+authenticator\s*;/i)
    expect(forward).not.toMatch(/WITH\s+ADMIN\s+OPTION/i)
    expect(forward).not.toMatch(/GRANT\s+workbuddy_runtime\s+TO\s+(anon|authenticated|service_role)/i)
    expect(forward).toMatch(/rolsuper[\s\S]+rolcanlogin[\s\S]+rolbypassrls/i)
    expect(forward).toContain('workbuddy_runtime must remain NOSUPERUSER NOLOGIN NOBYPASSRLS')
    expect(forward).toMatch(/ARRAY\['anon',\s*'authenticated',\s*'service_role'\]/i)
    expect(forward).toMatch(/pg_has_role\(forbidden_role,\s*'workbuddy_runtime',\s*'member'\)/i)
    expect(forward).toMatch(/IF NOT pg_has_role\('authenticator',\s*'workbuddy_runtime',\s*'member'\)/i)
    expect(forward).toMatch(/pg_auth_members[\s\S]+admin_option\s*=\s*false/i)
    expect(forward).toMatch(/IF\s+EXISTS\s*\([\s\S]+membership\.admin_option\s*=\s*true/i)
    expect(forward).toContain('authenticator must not retain ADMIN OPTION on workbuddy_runtime')
    expect(forward.match(/FOREACH forbidden_role IN ARRAY ARRAY\['anon', 'authenticated', 'service_role'\]/g)).toHaveLength(2)
  })

  it('removes only the PostgREST role membership during rollback', () => {
    const rollback = readFileSync(resolve(
      workspaceRoot,
      'server/migrations/rollback/336_runtime_postgrest_role_boundary.sql',
    ), 'utf8')

    expect(rollback).toMatch(/REVOKE\s+workbuddy_runtime\s+FROM\s+authenticator\s*;/i)
    expect(rollback).not.toMatch(/DROP\s+ROLE/i)
    expect(rollback).toMatch(/IF pg_has_role\('authenticator',\s*'workbuddy_runtime',\s*'member'\)/i)
    expect(rollback).toContain('migration 336 rollback did not revoke authenticator membership')
  })

  it('requires an explicit staging-first authorization before migration 336 can run', () => {
    const workflow = readFileSync(resolve(
      workspaceRoot,
      '.github/workflows/deploy.yml',
    ), 'utf8')

    expect(workflow).toContain('Authorize runtime PostgREST role boundary 336')
    expect(workflow).toContain('336_runtime_postgrest_role_boundary.sql')
    expect(workflow).toContain('MIGRATION_336_APPROVED_SHA')
    expect(workflow).toContain('MIGRATION_336_STAGING_EVIDENCE_REF')
    expect(workflow).toMatch(/RUNTIME_POSTGREST_ROLE_BOUNDARY_APPROVED_SHA[\s\S]+GITHUB_SHA[\s\S]+exit 1/)
    expect(workflow).toMatch(/DEPLOY_TARGET[\s\S]+staging[\s\S]+approved for this exact staging SHA/)
    expect(workflow).toMatch(/DEPLOY_TARGET[\s\S]+production[\s\S]+staging readback evidence/)
    expect(workflow).toMatch(/RUNTIME_POSTGREST_ROLE_BOUNDARY_STAGING_EVIDENCE_REF[\s\S]+exit 1/)
  })
})

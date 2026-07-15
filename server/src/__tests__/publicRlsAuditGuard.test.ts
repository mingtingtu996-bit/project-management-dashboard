import { describe, expect, it } from 'vitest'

const { evaluateRlsAuditRows } = await import('../../scripts/check-public-rls.mjs')

describe('public RLS audit guard', () => {
  it('fails tables with RLS disabled', () => {
    const audit = evaluateRlsAuditRows([
      { tablename: 'tasks', rowsecurity: false, policy_count: 0, policy_definition: '' },
    ])

    expect(audit.hasFailures).toBe(true)
    expect(audit.disabledTables.map((row: any) => row.tablename)).toEqual(['tasks'])
  })

  it('fails tables that enabled RLS without any policies', () => {
    const audit = evaluateRlsAuditRows([
      { tablename: 'companies', rowsecurity: true, policy_count: 0, policy_definition: '' },
    ])

    expect(audit.hasFailures).toBe(true)
    expect(audit.tablesWithoutPolicies.map((row: any) => row.tablename)).toEqual(['companies'])
  })

  it('fails tables that enabled RLS without forcing row level security', () => {
    const audit = evaluateRlsAuditRows([
      {
        tablename: 'projects',
        rowsecurity: true,
        force_rowsecurity: false,
        policy_count: 1,
        policy_definition: 'company_id = current_setting(\'app.company_id\')::uuid',
      },
    ])

    expect(audit.hasFailures).toBe(true)
    expect(audit.forceMissingTables.map((row: any) => row.tablename)).toEqual(['projects'])
  })

  it('fails policy tables without an obvious tenant predicate', () => {
    const audit = evaluateRlsAuditRows([
      {
        tablename: 'project_daily_snapshot',
        rowsecurity: true,
        policy_count: 1,
        policy_definition: 'true',
      },
    ])

    expect(audit.hasFailures).toBe(true)
    expect(audit.tablesWithoutTenantPredicate.map((row: any) => row.tablename)).toEqual(['project_daily_snapshot'])
  })

  it('accepts RLS policy tables with tenant predicates', () => {
    const audit = evaluateRlsAuditRows([
      {
        tablename: 'tasks',
        rowsecurity: true,
        force_rowsecurity: true,
        policy_count: 1,
        policy_definition: 'EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = tasks.project_id AND pm.user_id = auth.uid())',
      },
    ])

    expect(audit.hasFailures).toBe(false)
    expect(audit.policyTables.map((row: any) => row.tablename)).toEqual(['tasks'])
  })
})
